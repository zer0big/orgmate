import { app } from '@azure/functions';

// Keep telemetry light; the host already logs invocations.
app.setup({
  enableHttpStream: false,
});

// Function registrations. Every handler module registers itself on import.
import './functions/health.js';
import './functions/sessions.js';
import './functions/templates.js';
import './functions/transcribe.js';
import './functions/summarize.js';
