# Tracing System Guide

## Quick Start

The enhanced tracing system provides powerful debugging capabilities for the Homologation application. It tracks async operations, captures state snapshots, intercepts React warnings, and persists your debugging preferences.

### Enabling Tracing from Browser Console

```javascript
// Get help
window.tracing.help()

// Enable all tracing
window.tracing.enable()

// Disable all tracing
window.tracing.disable()

// Enable specific namespace
window.tracing.enableNamespace('[FLOW]')

// Disable noisy namespace
window.tracing.disableNamespace('[VALIDATION]')

// View current settings
window.tracing.getSettings()

// Reset to defaults
window.tracing.reset()

// Capture a state snapshot manually
window.tracing.captureState('after form submit', formData)

// View active async operations
window.tracing.activeOps()
```

### Settings Persistence

Your tracing preferences are automatically saved to localStorage and restored on page reload. This means:
- You only need to configure once per browser
- Settings survive page refreshes
- Each developer can have their own preferences

---

## Common Debugging Scenarios

### Scenario 1: Form Field Not Updating

**Symptoms**: A field should auto-populate but stays empty

**Solution**: Enable CASCADE and DEFAULTS namespaces to see timing

```javascript
window.tracing.enableNamespace('[CASCADE]')
window.tracing.enableNamespace('[DEFAULTS]')
```

**What to Look For**:
```
[CASCADE] [12:34:56.050] 🧹 Limpiando campo: issueCurrency = (vacío)
[ASYNC-START] [DEFAULTS]-5 AUTO-DEFAULTS useEffect
[VALIDATION] [12:34:56.055] ❌ Campo requerido vacío: issueCurrency
[ASYNC-END] [DEFAULTS]-5 { duration: '45ms' }
```

**Analysis**: VALIDATION ran at T+55ms but DEFAULTS didn't finish until T+95ms. The async operation completed too late!

### Scenario 2: React Duplicate Key Warning

**Symptoms**: Console shows "Each child in a list should have a unique key prop"

**What You'll See**:
```
🔴 REACT WARNING: Duplicate Keys Detected
  This usually means a field is rendering duplicate options or components
  Active async operations: [{ id: '[DEFAULTS]-5', elapsed: '32ms' }]
  Origin stack: [...]
```

**Solution**: The warning now includes context about what async operations were running. Check if data is loading multiple times or if a useEffect is missing dependencies.

### Scenario 3: State Changes Not Visible

**Symptoms**: CASCADE should clear fields but you can't see what changed

**Solution**: Use state snapshots in the code

```javascript
// In useFieldCascade.js
traceState(TRACE.CASCADE, `BEFORE cascade (${name} changed)`, formData);

// ... perform changes ...

traceState(TRACE.CASCADE, `AFTER cascade (${name} changed)`, projectedState, {
  diff: true,
  prevState: formData
});
```

**What You'll See**:
```
[CASCADE] 📸 BEFORE cascade (investmentTypeCode changed)
  State: { issueCurrency: 'USD', riskCurrency: 'USD', sectorGICS: '' }

[CASCADE] 📸 AFTER cascade (investmentTypeCode changed)
  Changes: {
    issueCurrency: { from: 'USD', to: '' },
    riskCurrency: { from: 'USD', to: '' },
    sectorGICS: { from: '', to: '66666666' }
  }
  Call stack: [...]
```

### Scenario 4: Async Operation Correlation

**Symptoms**: You see multiple async operations but can't tell which logs belong together

**Solution**: Look for operation IDs in square brackets

```
[ASYNC-START] [DEFAULTS]-5 AUTO-DEFAULTS useEffect
[CASCADE] [12:34:56.050] Processing field change
[DEFAULTS]-5 [12:34:56.070] Fetching from API
[ASYNC-END] [DEFAULTS]-5 { duration: '45ms' }
```

**Analysis**: Operation `[DEFAULTS]-5` started at T+0ms and completed at T+45ms. Any logs with that ID are related.

---

## API Reference

### window.tracing.enable()
Enables all tracing output. Settings are saved to localStorage.

**Returns**: `void`

### window.tracing.disable()
Disables all tracing output. Settings are saved to localStorage.

**Returns**: `void`

### window.tracing.enableNamespace(namespace)
Enables a specific namespace while keeping others at their current state.

**Parameters**:
- `namespace` (string): The namespace to enable (e.g., `'[CASCADE]'`)

**Example**:
```javascript
window.tracing.enableNamespace('[FLOW]')
```

### window.tracing.disableNamespace(namespace)
Disables a specific namespace while keeping others at their current state.

**Parameters**:
- `namespace` (string): The namespace to disable (e.g., `'[VALIDATION]'`)

**Example**:
```javascript
// Too much validation noise during development
window.tracing.disableNamespace('[VALIDATION]')
```

### window.tracing.getSettings()
Returns the current tracing configuration.

**Returns**:
```javascript
{
  enabled: boolean,
  namespaces: {
    '[FLOW]': boolean,
    '[VALIDATION]': boolean,
    '[CASCADE]': boolean,
    '[DEFAULTS]': boolean,
    '[READONLY]': boolean,
    '[CONFIG]': boolean,
    '[COMPANY]': boolean,
    '[MODE]': boolean
  }
}
```

### window.tracing.reset()
Resets all settings to defaults (all namespaces enabled, tracing enabled).

**Returns**: `void`

### window.tracing.captureState(label, state)
Manually capture a state snapshot with a descriptive label.

**Parameters**:
- `label` (string): Description of what state you're capturing
- `state` (object): The state object to inspect

**Example**:
```javascript
window.tracing.captureState('after company select', formData)
```

### window.tracing.activeOps()
Displays currently running async operations in a table.

**Returns**: Array of operation objects with timing information

**Example Output**:
```
┌─────────┬──────────────┬─────────────────────┬───────────┐
│ (index) │      id      │        name         │  elapsed  │
├─────────┼──────────────┼─────────────────────┼───────────┤
│    0    │ [DEFAULTS]-5 │ AUTO-DEFAULTS       │ '32.45ms' │
│    1    │ [COMPANY]-2  │ fetchCompanyData    │ '120.8ms' │
└─────────┴──────────────┴─────────────────────┴───────────┘
```

### window.tracing.TRACE
Access to namespace constants for programmatic use.

**Properties**:
- `TRACE.FLOW`
- `TRACE.VALIDATION`
- `TRACE.CASCADE`
- `TRACE.DEFAULTS`
- `TRACE.READONLY`
- `TRACE.CONFIG`
- `TRACE.COMPANY`
- `TRACE.MODE`

### window.tracing.help()
Displays help text with all available commands.

---

## Adding Traces to Code

### Import Tracing Utilities

```javascript
import { trace, TRACE, traceAsync, traceState } from '../utils/tracing';
```

### Basic Logging

```javascript
// Simple log
trace.log(TRACE.FLOW, 'Form submitted', { mode, step });

// Group with enter/exit
trace.enter(TRACE.CASCADE, 'handleFieldChange', { field: 'investmentTypeCode' });
// ... do work ...
trace.exit(TRACE.CASCADE, 'handleFieldChange', { result });

// Specialized logs
trace.error(TRACE.VALIDATION, 'Failed to validate', error);
trace.warn(TRACE.CONFIG, 'Missing config for type', { type });
trace.success(TRACE.DEFAULTS, 'All defaults applied');
```

### Async Operation Tracking

Wrap any async operation with `traceAsync` to get automatic timing and correlation:

```javascript
const result = await traceAsync(TRACE.DEFAULTS, 'applyDefaults', async () => {
  // Your async logic here
  const data = await api.catalogos.getMonedaById(monedaId);
  return data;
});
```

**Output**:
```
[ASYNC-START] [DEFAULTS]-5 applyDefaults { namespace: '[DEFAULTS]' }
... your logs here ...
[ASYNC-END] [DEFAULTS]-5 applyDefaults { duration: '45.23ms', result: {...} }
```

If an error occurs:
```
[ASYNC-ERROR] [DEFAULTS]-5 applyDefaults { duration: '23.11ms', error: Error(...) }
```

### State Snapshots

Capture before/after state changes with optional diff:

```javascript
// Before change
traceState(TRACE.CASCADE, 'BEFORE cascade', formData);

// Apply changes
const updates = { ...formData, ...newFields };

// After change with diff
traceState(TRACE.CASCADE, 'AFTER cascade', updates, {
  diff: true,
  prevState: formData
});
```

### Conditional Tracing

Use namespace checks to avoid expensive operations when tracing is disabled:

```javascript
import { isNamespaceEnabled, TRACE } from '../utils/tracing';

if (isNamespaceEnabled(TRACE.VALIDATION)) {
  const debugSnapshot = createExpensiveSnapshot(formData);
  trace.log(TRACE.VALIDATION, 'Full validation', debugSnapshot);
}
```

---

## Namespaces Explained

Each namespace has a distinct color in the console for easy visual identification.

### [FLOW] - Blue
**Color**: `#2196F3` (Blue)

**Purpose**: High-level application flow and component lifecycle

**Use When**:
- Component mounts/unmounts
- Major state transitions
- Navigation changes
- Mode switches (nueva/reestructuracion/edit)

**Example**:
```javascript
trace.enter(TRACE.FLOW, 'InstrumentForm.mount', { mode, instrumentId });
```

### [VALIDATION] - Green
**Color**: `#4CAF50` (Green)

**Purpose**: Form validation logic and results

**Use When**:
- Field validation
- Form submission validation
- Duplicate checking
- Required field checks

**Example**:
```javascript
trace.validation('Checking required field', { field: 'isin', value, required: true });
```

### [CASCADE] - Orange
**Color**: `#FF9800` (Orange)

**Purpose**: Field dependency cascade logic

**Use When**:
- A field change triggers clearing other fields
- Evaluating cascade conditions
- Applying cascade rules

**Example**:
```javascript
trace.cascade('🧹 Limpiando campo', { field, defaultValue });
```

### [DEFAULTS] - Purple
**Color**: `#9C27B0` (Purple)

**Purpose**: Auto-population and default value application

**Use When**:
- Applying static defaults from config
- Fetching dynamic defaults from API
- Auto-filling currencies
- Setting calculated defaults

**Example**:
```javascript
trace.defaults('✅ Aplicando default', { field, value });
```

### [READONLY] - Brown
**Color**: `#795548` (Brown)

**Purpose**: Read-only field logic and access control

**Use When**:
- Determining if a field should be read-only
- Blocking field edits
- Mode-based field access

**Example**:
```javascript
trace.readonly('Field locked in edit mode', { field: 'investmentTypeCode' });
```

### [CONFIG] - Blue Grey
**Color**: `#607D8B` (Blue Grey)

**Purpose**: Configuration loading and validation

**Use When**:
- Loading asset type configs
- Validating config structure
- Applying config rules
- Missing config warnings

**Example**:
```javascript
trace.config('Loading config', { investmentTypeCode, configName });
```

### [COMPANY] - Cyan
**Color**: `#00BCD4` (Cyan)

**Purpose**: Company search and auto-population

**Use When**:
- Searching for companies
- Selecting a company
- Auto-populating from company data
- Company state changes

**Example**:
```javascript
trace.company('Auto-populating from company', { companyName, fields });
```

### [MODE] - Pink
**Color**: `#E91E63` (Pink)

**Purpose**: Form mode logic (nueva/reestructuracion/edit)

**Use When**:
- Mode changes
- Mode-specific behavior
- Step progression logic
- Mode validation

**Example**:
```javascript
trace.mode('Progressing to step 3', { currentStep: 3, investmentTypeCode });
```

---

## Best Practices

### 1. Use Appropriate Namespaces
Choose the namespace that best describes what you're logging. This makes it easy to filter and correlate logs.

**Good**:
```javascript
trace.cascade('Clearing dependent fields', { fields });
```

**Bad**:
```javascript
trace.log(TRACE.FLOW, 'Clearing dependent fields', { fields });
```

### 2. Include Relevant Context
Always include data that helps understand what's happening.

**Good**:
```javascript
trace.validation('Field validation failed', {
  field: 'isin',
  value: formData.isin,
  error: 'Invalid format',
  expected: '12 characters'
});
```

**Bad**:
```javascript
trace.validation('Validation failed');
```

### 3. Use Async Tracking for All Async Operations
Wrap any async operation (API calls, setTimeout, etc.) with `traceAsync` for automatic timing.

**Good**:
```javascript
await traceAsync(TRACE.COMPANY, 'fetchCompany', async () => {
  return await api.company.search(query);
});
```

**Bad**:
```javascript
trace.company('Fetching company');
const result = await api.company.search(query);
trace.company('Company fetched');
```

### 4. Use State Snapshots for Complex State Changes
When multiple fields change at once, use `traceState` with diff to see exactly what changed.

**Good**:
```javascript
traceState(TRACE.CASCADE, 'After cascade', newState, {
  diff: true,
  prevState: oldState
});
```

**Bad**:
```javascript
trace.cascade('Fields changed', { newState });
```

### 5. Use enter/exit for Function Boundaries
Group related logs with `trace.enter()` and `trace.exit()`.

**Good**:
```javascript
trace.enter(TRACE.CASCADE, 'handleChangeWithCascade', { field, value });
// ... multiple operations ...
trace.exit(TRACE.CASCADE, 'handleChangeWithCascade', { updates });
```

**Bad**:
```javascript
trace.cascade('Starting handleChangeWithCascade');
// ... operations ...
trace.cascade('Ending handleChangeWithCascade');
```

### 6. Disable Noisy Namespaces During Development
If a namespace is too verbose for what you're debugging, disable it temporarily.

```javascript
// I'm debugging company auto-populate, don't need validation noise
window.tracing.disableNamespace('[VALIDATION]')
```

### 7. Capture State at Key Decision Points
Before and after critical operations, capture state snapshots.

```javascript
// Before applying defaults
traceState(TRACE.DEFAULTS, 'BEFORE defaults', formData);

// Apply defaults
setFields(defaults);

// After applying defaults
traceState(TRACE.DEFAULTS, 'AFTER defaults', { ...formData, ...defaults });
```

---

## Troubleshooting

### Tracing Not Working
**Symptoms**: No console output even after `window.tracing.enable()`

**Solutions**:
1. Check if tracing is actually enabled:
   ```javascript
   window.tracing.getSettings()
   ```

2. Check if the namespace is enabled:
   ```javascript
   window.tracing.enableNamespace('[FLOW]')
   ```

3. Clear localStorage and reset:
   ```javascript
   localStorage.removeItem('homologation_tracing_settings')
   window.tracing.reset()
   ```

4. Refresh the page to reload settings

### Too Much Output
**Symptoms**: Console is flooded with logs

**Solutions**:
1. Disable verbose namespaces:
   ```javascript
   window.tracing.disableNamespace('[VALIDATION]')
   window.tracing.disableNamespace('[FLOW]')
   ```

2. Focus on specific namespaces:
   ```javascript
   window.tracing.disable()  // Turn everything off
   window.tracing.enableNamespace('[CASCADE]')  // Only cascade
   window.tracing.enableNamespace('[DEFAULTS]')  // And defaults
   ```

### Can't Find Related Logs
**Symptoms**: Multiple async operations running, hard to correlate logs

**Solutions**:
1. Look for operation IDs in square brackets:
   ```
   [ASYNC-START] [DEFAULTS]-5
   ```

2. Use `window.tracing.activeOps()` to see what's currently running

3. Add more `traceAsync` wrappers to get operation IDs for everything

### State Snapshots Too Large
**Symptoms**: Console is cluttered with huge state objects

**Solutions**:
1. Pass only relevant parts of state:
   ```javascript
   traceState(TRACE.CASCADE, 'After cascade', {
     investmentTypeCode: formData.investmentTypeCode,
     issueCurrency: formData.issueCurrency,
     riskCurrency: formData.riskCurrency
   });
   ```

2. Use conditional tracing for expensive operations:
   ```javascript
   if (isNamespaceEnabled(TRACE.CASCADE)) {
     traceState(TRACE.CASCADE, 'Full state', formData);
   }
   ```

### Settings Not Persisting
**Symptoms**: Settings reset on page reload

**Solutions**:
1. Check if localStorage is blocked by browser settings
2. Check browser console for localStorage errors
3. Verify you're on the same domain (settings are per-domain)
4. Try:
   ```javascript
   window.tracing.reset()  // Force save
   ```

---

## Performance Considerations

### Tracing is Designed to be Fast
- Namespace checks happen first - if disabled, function returns immediately
- No expensive operations run unless namespace is enabled
- localStorage writes are synchronous but small (< 1KB)

### When to Worry About Performance
- **Never in production**: Tracing should be disabled in production builds
- **Large state snapshots**: If capturing entire form state (100+ fields) repeatedly
- **High-frequency events**: Logging on every keypress or mousemove

### Optimization Tips
```javascript
// Bad: Expensive operation runs even if tracing disabled
trace.log(TRACE.FLOW, 'Data', createExpensiveDebugInfo());

// Good: Operation only runs if namespace enabled
if (isNamespaceEnabled(TRACE.FLOW)) {
  trace.log(TRACE.FLOW, 'Data', createExpensiveDebugInfo());
}
```

---

## Examples Gallery

### Example 1: Debugging Step Progression

**Problem**: Form stuck at Step 3, not progressing to Step 4

**Code**:
```javascript
// InstrumentForm.jsx
trace.enter(TRACE.FLOW, 'Checking step progression', {
  currentStep,
  investmentTypeCode: formData.investmentTypeCode,
  nameInstrumento: formData.nameInstrumento
});

const canProgress = formData.investmentTypeCode && formData.nameInstrumento;
trace.mode('Step 1 completion check', {
  canProgress,
  reason: canProgress ? 'OK' : 'Missing required fields'
});

trace.exit(TRACE.FLOW, 'Checking step progression', { newStep });
```

**Console Commands**:
```javascript
window.tracing.enableNamespace('[FLOW]')
window.tracing.enableNamespace('[MODE]')
```

### Example 2: Debugging Cascade Logic

**Problem**: Changing investmentTypeCode clears too many fields

**Code**:
```javascript
// useFieldCascade.js
trace.enter(TRACE.CASCADE, 'handleChangeWithCascade', { field: name, value: newValue });

traceState(TRACE.CASCADE, 'BEFORE cascade', formData);

// Apply cascade logic
const updates = { [name]: newValue };
config.clearFields.forEach(field => {
  trace.cascade(`🧹 Clearing ${field}`);
  updates[field] = '';
});

traceState(TRACE.CASCADE, 'AFTER cascade', { ...formData, ...updates }, {
  diff: true,
  prevState: formData
});

trace.exit(TRACE.CASCADE, 'handleChangeWithCascade', { totalUpdates: Object.keys(updates).length });
```

**Console Commands**:
```javascript
window.tracing.enableNamespace('[CASCADE]')
// Disable noise
window.tracing.disableNamespace('[VALIDATION]')
window.tracing.disableNamespace('[DEFAULTS]')
```

### Example 3: Debugging Async Timing

**Problem**: Currency fields empty after country selection

**Code**:
```javascript
// InstrumentForm.jsx
useEffect(() => {
  traceAsync(TRACE.DEFAULTS, 'AUTO-DEFAULTS useEffect', async () => {
    const fieldsToApply = {};

    if (formData.moneda) {
      trace.defaults('Fetching moneda from API', { monedaId: formData.moneda });

      const monedaRes = await api.catalogos.getMonedaById(formData.moneda);

      if (monedaRes.success) {
        fieldsToApply.issueCurrency = monedaRes.data.nombre;
        fieldsToApply.riskCurrency = monedaRes.data.nombre;
        trace.defaults('✅ Currencies set', fieldsToApply);
      }
    }

    if (Object.keys(fieldsToApply).length > 0) {
      setFields(fieldsToApply);
    }

    return fieldsToApply;
  });
}, [formData.moneda, formData.issueCountry, formData.riskCountry]);
```

**Console Commands**:
```javascript
window.tracing.enableNamespace('[DEFAULTS]')
window.tracing.enableNamespace('[CASCADE]')
window.tracing.enableNamespace('[VALIDATION]')

// Watch for timing
window.tracing.activeOps()  // Check what's running
```

---

## Integration with Development Workflow

### During Local Development
1. Enable tracing once:
   ```javascript
   window.tracing.enable()
   ```

2. Disable noisy namespaces:
   ```javascript
   window.tracing.disableNamespace('[FLOW]')
   ```

3. Work on your feature - settings persist across page reloads

4. When debugging specific issues, enable relevant namespaces:
   ```javascript
   window.tracing.enableNamespace('[CASCADE]')
   ```

### Code Review Checklist
When adding new features, ensure:
- [ ] Async operations wrapped with `traceAsync`
- [ ] Complex state changes have `traceState` snapshots
- [ ] Appropriate namespace used
- [ ] Context data included in logs
- [ ] No console.log() left in code (use trace instead)

### Production Builds
Tracing can be disabled in production:
1. Use environment variable to disable tracing at build time
2. Or rely on developers to manually disable via `window.tracing.disable()`

---

## Advanced Topics

### Creating Debug Snapshots
For complex debugging, create comprehensive snapshots:

```javascript
import { createDebugSnapshot } from '../utils/tracing';

const snapshot = createDebugSnapshot(formData, 'After company select');
// Snapshot includes: timestamp, label, state, call stack
```

### Custom Timing Groups
Track timing for related operations:

```javascript
import { traceTime } from '../utils/tracing';

traceTime(TRACE.DEFAULTS, 'Total defaults application', () => {
  // Multiple operations here
  applyStaticDefaults();
  applyDynamicDefaults();
  applyCurrencies();
});
```

### Namespace Filters in Code
Programmatically check namespace state:

```javascript
import { isNamespaceEnabled, TRACE } from '../utils/tracing';

if (isNamespaceEnabled(TRACE.VALIDATION)) {
  // Run expensive validation diagnostics
}
```

---

## FAQ

**Q: Will tracing slow down my app?**
A: No. Namespace checks are instant, and disabled namespaces skip all logging. Enabled tracing has minimal overhead (< 1ms per log).

**Q: Can I use tracing in production?**
A: Yes, but it's recommended to disable it. Users can still enable it via `window.tracing.enable()` if needed for support.

**Q: How do I add a new namespace?**
A: Edit `src/utils/tracing.js`, add to `TRACE` constant, add color to `NAMESPACE_STYLES`, and add to `ENABLED_NAMESPACES`.

**Q: Can I export logs?**
A: Browser console has built-in "Save as..." to export console output. You can also copy/paste from the console.

**Q: What if I accidentally commit enabled tracing?**
A: No problem! Tracing state is stored in localStorage per developer. Your enabled settings won't affect other developers.

**Q: How do I see all active async operations?**
A: Use `window.tracing.activeOps()` which displays a table of currently running operations with timing.

**Q: Can I trace in useEffect?**
A: Yes! Use `traceAsync` for the entire effect:
```javascript
useEffect(() => {
  traceAsync(TRACE.DEFAULTS, 'myEffect', async () => {
    // Your effect logic
  });
}, [deps]);
```

---

## Summary

The enhanced tracing system provides:
- ✅ **8 color-coded namespaces** for easy visual filtering
- ✅ **Async operation tracking** with timing and correlation
- ✅ **State snapshots with diffs** to visualize changes
- ✅ **React warning interception** with enhanced context
- ✅ **localStorage persistence** across page reloads
- ✅ **Runtime control** via `window.tracing` API
- ✅ **Zero performance impact** when disabled

**Get Started**:
```javascript
window.tracing.help()
```

**Common Commands**:
```javascript
window.tracing.enable()
window.tracing.disableNamespace('[VALIDATION]')
window.tracing.activeOps()
```

**In Code**:
```javascript
import { trace, TRACE, traceAsync, traceState } from '../utils/tracing';

await traceAsync(TRACE.DEFAULTS, 'myOperation', async () => {
  // Your async code
});
```

Happy debugging! 🐛🔍
