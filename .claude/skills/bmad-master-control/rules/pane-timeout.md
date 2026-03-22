# PANE_TIMEOUT Rules

## Applicable Rules
- Timeout means the pane has exceeded its expected execution window
- This does NOT necessarily mean the worker is stuck — it may still be making progress
- Check for progress before taking action

## Diagnostic Procedure

### Step 1: Check scrollback activity
- If pane scrollback is still changing → worker is active, extend timeout
- If pane scrollback is static → worker may be stuck or waiting for input

### Step 2: Evaluate timeout severity
- Soft timeout (1x expected duration) → notify user, continue monitoring
- Hard timeout (2x expected duration) → likely stuck, intervention needed
- Critical timeout (3x+ expected duration) → force intervention

### Step 3: Choose response

#### Worker still active (scrollback changing)
- Extend the timeout window
- Notify user that task is running long but progressing
- No command needed — continue monitoring

#### Worker appears stuck (scrollback static)
- First timeout: REQUEST_HUMAN with timeout context
- Repeated timeout on same task: HEALTH rebuild_pane may be needed
- Check if the worker is waiting for user input (permission prompt, etc.)

## Authority
- L1: Commander notifies human on first timeout
- L2: Human decides whether to kill, extend, or rebuild

## Note
Always prefer notification over automatic intervention for timeouts.
The human may know the task is expected to run long.
