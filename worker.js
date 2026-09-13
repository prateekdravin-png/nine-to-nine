// worker.js — the same site, for Cloudflare's Workers product instead of Pages.
//
// Cloudflare has two ways to host this and the dashboard now steers you to the newer one, so the repo
// supports both rather than depending on which button was pressed:
//
//   Pages    reads functions/api/*.js by convention. Nothing else needed.
//   Workers  reads wrangler.toml, runs this file, and serves dist/ through the ASSETS binding.
//
// The endpoints are not reimplemented here. This routes to the very same handlers the Pages build uses,
// so there is one copy of the validation and one copy of the storage, whichever product is running.
import { onRequestPost as postEvent } from './functions/api/event.js';
import { onRequestGet as getEvents } from './functions/api/events.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/event') {
      return request.method === 'POST'
        ? postEvent({ request, env, ctx })
        : new Response('Method not allowed', { status: 405 });
    }
    if (pathname === '/api/events') {
      return request.method === 'GET'
        ? getEvents({ request, env, ctx })
        : new Response('Method not allowed', { status: 405 });
    }

    // Everything else is the game itself: the files npm run build put in dist/.
    return env.ASSETS.fetch(request);
  }
};
