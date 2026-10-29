import worker from './entry.js';

// A separate judge-demo build boundary. Ignore every runtime flag, provider key
// and storage binding, even if accidentally supplied by a hosting environment.
const offlineEnvironment = Object.freeze({ NEBIUS_ENABLE_LIVE: 'false', TAVILY_ENABLE_LIVE: 'false', PROVIDER_HARD_CAPS_VERIFIED: 'false' });

export default {
  fetch(request: Request, _ignoredRuntimeEnvironment?: unknown) {
    return worker.fetch(request, offlineEnvironment);
  },
};
