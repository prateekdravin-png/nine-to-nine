// content.js — the five playable roles: each role's messages, the work it types out on screen, and how
// the game talks about its deliverable. Kept apart from the rules (core.js) so content can be written
// and rebalanced without touching game logic. The rules are identical for every role, so scores are
// comparable and one set of balance checks (test/core.test.js) covers all of them.
//
// The skill being tested is judgment under pressure, NOT reading speed. For that to hold, in EVERY role:
//   * Messages stay SHORT — seven words at most. Playtesting found the first, longer wording left a
//     first-time player losing about a quarter of all messages to the clock before they could read them.
//   * The tell comes FIRST, ideally in the first two words, where the eye lands (and all a player sees
//     of a collapsed message in variant B).
//   * The tells are consistent, so they can be learned:
//       urgent  — a real consequence and a deadline. Never uses minimising language.
//       trap    — ALWAYS minimises: "quick", "just", "small", "tiny", "only", "a sec". Often sent by the
//                 same people who send urgent messages, so the sender alone is never the tell.
//       trivial — social, broadcast, personal, or a harmless bot notification.
//   * Urgent and trap messages are unique to their role, so each role feels like its own job.
//   * Pools are deliberately large (14 urgent and 14 traps per role at junior, 12 at each later level)
//     so rounds feel different. core.js deals them like a shuffled deck: no repeats within a round, and
//     messages from recent practice rounds come last.
// test/core.test.js enforces all of this, so a new message or a new role can't quietly break it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NineContent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Life doesn't care what your job title is — every role gets these alongside its own small talk.
  //
  // `favour` marks small talk from a colleague: reply and that person owes you one (core.js, FAVOURS).
  // Only individual colleagues give favours. Bots, broadcasts, group chats and family don't, so reading
  // the sender matters for small talk too. Favours only ever appear on small talk, never on urgent
  // messages or traps.
  const SHARED_TRIVIAL = [
    { from: 'Kiran', avatar: '🧑', text: 'chai? ☕', favour: 'Kiran' },
    { from: 'Team Bangalore 🎉', avatar: '👥', text: 'Happy bday Suresh!! (reply-all)' },
    { from: 'Admin', avatar: '🏢', text: 'Fun Friday: ethnic wear' },
    { from: 'Society WhatsApp', avatar: '🏘️', text: 'Water off tomorrow 10–12' },
    { from: 'Mom', avatar: '👩', text: 'Beta, did you eat?' },
    { from: 'HR', avatar: '🗂️', text: 'Optional wellness survey 🌱' },
    { from: 'Family Group', avatar: '👨‍👩‍👧', text: 'Good morning 🌞🙏' },
    { from: 'Swathi', avatar: '👩', text: 'biryani order? 🍛', favour: 'Swathi' },
    { from: 'Townhall Bot', avatar: '📣', text: 'All-hands Thursday. Snacks confirmed.' },
    { from: 'Anil', avatar: '🧔', text: 'who took my charger', favour: 'Anil' },
    { from: 'Office Bot', avatar: '🏢', text: 'Printer on floor 3 is fixed 🖨️' },
    { from: 'Alex', avatar: '🧑', text: 'anyone up for coffee? ☕', favour: 'Alex' },
    { from: 'Weather App', avatar: '🌦️', text: 'Rain expected at 5 PM' }
  ];

  const ROLE_ORDER = ['developer', 'tester', 'analyst', 'support', 'manager'];

  const ROLES = {
    developer: {
      id: 'developer',
      label: 'Developer',
      emoji: '💻',
      tagline: 'Ship the feature. Beware the "quick PR review".',
      goal: 'Ship the feature by lunch.',
      verb: 'code',
      doing: 'CODING',
      deliverable: { noun: 'feature', done: 'shipped' },
      progressLabel: 'Feature',
      work: {
        file: 'payment-service / checkout.ts',
        kind: 'code',
        text: [
          '// checkout.ts — PAYMENT-2231 "small change" (estimate: 1 hour. today: day 4)',
          "import { applyCoupon, calcGst } from './pricing';",
          "import { logger } from '../utils/logger'; // do not touch — legacy from 2014",
          '',
          'export async function checkout(cart, user) {',
          '  if (!cart.items.length) {',
          "    throw new EmptyCartError('cart is empty'); // Ramesh said this never happens",
          '  }',
          '  const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);',
          '  const discounted = applyCoupon(subtotal, cart.coupon);',
          '  const gst = calcGst(discounted, user.state);',
          '  // TODO: ask the onsite team why this works',
          '  const total = Math.round((discounted + gst) * 100) / 100;',
          '',
          "  const order = await orders.create({ userId: user.id, total, status: 'PENDING' });",
          '  logger.info(`order ${order.id} created`); // spams prod logs, will fix after release',
          '',
          '  try {',
          '    await payments.charge(user.wallet, total, { retries: 3 });',
          "    await orders.update(order.id, { status: 'PAID' });",
          '  } catch (err) {',
          "    await orders.update(order.id, { status: 'FAILED' });",
          '    throw err; // not my module',
          '  }',
          '  return order;',
          '}',
          '',
          'export function isEligibleForEmi(total) {',
          '  return total >= 3000; // magic number, approved in the 2019 townhall',
          '}',
          '',
          ''
        ].join('\n')
      },
      messages: {
        urgent: [
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'PROD down. Join the bridge NOW', busyText: 'On the incident bridge…' },
          { from: 'PagerDuty', avatar: '🚨', text: 'P1: payments failing', busyText: 'Firefighting payments…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Your PR is blocking the release', busyText: 'Fixing the failing check…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Demo starting. Build is red!', busyText: 'Rescuing the demo build…' },
          { from: 'Jenkins', avatar: '🤖', text: 'BUILD FAILED on main: your commit', busyText: 'Unbreaking main…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Client escalated. Need ETA now', busyText: 'Writing the ETA email…' },
          { from: 'Security Team', avatar: '🛡️', text: 'URGENT: rotate your leaked API key', busyText: 'Rotating the leaked key…' },
          { from: 'Release Manager', avatar: '📦', text: 'Go/no-go call: need your sign-off', busyText: 'On the go/no-go call…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Prod data wrong. Check your migration', busyText: 'Checking the migration…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: APAC login is down', busyText: 'Restoring login…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: checkout returns 500 errors', busyText: 'Debugging checkout errors…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Hotfix needed before the 11 AM release', busyText: 'Writing the hotfix…' },
          { from: 'Database Bot', avatar: '🗄️', text: 'DB CPU at 100%. Queries timing out', busyText: 'Killing slow queries…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Customer data leak reported. Call NOW', busyText: 'On the security call…' }
        ],
        trivial: [
          { from: 'Dev Chat', avatar: '💬', text: 'Tabs vs spaces, round 47' },
          { from: 'Jenkins', avatar: '🤖', text: 'Nightly build passed ✅' },
          { from: 'Dependabot', avatar: '🔧', text: '14 PRs to bump lodash' },
          { from: 'Kiran', avatar: '🧑', text: 'bro new canteen menu 😭', favour: 'Kiran' },
          { from: 'Git Bot', avatar: '🤖', text: 'Your branch is 42 commits behind' },
          { from: 'Leo · Frontend', avatar: '🧑‍🎨', text: 'lunch? trying the new place 🌮', favour: 'Leo' }
        ],
        trap: [
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Quick call? 2 mins', busyText: "On a '2 minute' call…", aftermath: "The '2-minute call' ended 35 minutes later." },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just a small change 🙂', busyText: "Making the 'small change'…", aftermath: "The 'small change' touched 14 files." },
          { from: 'Neha · QA', avatar: '🧪', text: 'Quick look? Log is 40 MB', busyText: 'Reading a 40 MB log…', aftermath: 'You now know more about that log than anyone should.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick sync before the sync-up?', busyText: 'Syncing about the sync…', aftermath: 'You synced about the sync. Nothing was synced.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Small doubt, free for a sec?', busyText: 'At the whiteboard…', aftermath: "The 'small doubt' became a whiteboard session." },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Just quickly align on alignment?', busyText: 'Aligning on the alignment…', aftermath: 'Everyone is now aligned on needing another alignment.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Tiny UI tweak, very minor 🙏', busyText: "Doing the 'tiny tweak'…", aftermath: "The 'tiny tweak' was a redesign." },
          { from: 'Neha · QA', avatar: '🧪', text: 'Only 5 mins, walk me through?', busyText: 'Walking through the flow…', aftermath: '5 minutes, give or take 40.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just estimate this epic, real quick?', busyText: 'Estimating an epic…', aftermath: 'You estimated it. It will be wrong.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Quick PR review? (3,200 lines)', busyText: 'Reviewing 3,200 lines…', aftermath: 'You approved it. Nobody read it. Including you.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just one more tiny feature?', busyText: "Adding 'one tiny feature'…", aftermath: 'The tiny feature needed a new database.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Quick brainstorm on microservices?', busyText: 'Brainstorming microservices…', aftermath: 'The brainstorm produced 14 new services and no code.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Only a small copy change 🙂', busyText: "Making a 'small copy change'…", aftermath: 'The copy change needed legal approval.' },
          { from: 'Neha · QA', avatar: '🧪', text: 'Got a sec to debug my setup?', busyText: "Debugging someone else's laptop…", aftermath: 'It was a proxy setting. It took an hour.' }
        ]
      }
    },

    tester: {
      id: 'tester',
      label: 'Tester',
      emoji: '🧪',
      tagline: 'Sign off the release. Beware "just retest everything".',
      goal: 'Sign off the release by lunch.',
      verb: 'test',
      doing: 'TESTING',
      deliverable: { noun: 'test cycle', done: 'signed off' },
      progressLabel: 'Test cycle',
      work: {
        file: 'regression-suite / checkout.run',
        kind: 'testlog',
        text: [
          '# regression-suite / checkout — build 4.12.0-rc3 ("small fix", 3rd rc this week)',
          "▶ Running 148 test cases on Chrome, Firefox, Safari and the client's IE11 (yes, really)",
          '',
          '✓ TC-001  login with valid OTP',
          '✓ TC-002  login with expired OTP shows an error',
          '✓ TC-014  add item to cart',
          '✗ TC-015  apply coupon FLAT50: expected ₹450, got ₹500',
          '    ↳ logged BUG-3321, assigned to dev (status: "works on my machine")',
          '✓ TC-016  remove item from cart',
          '✓ TC-022  GST calculated for Karnataka',
          '✗ TC-023  GST calculated for Maharashtra: off by ₹0.01',
          '    ↳ rounding again. reopened BUG-2987 (4th time)',
          '✓ TC-030  pay with UPI',
          '✓ TC-031  pay with saved card',
          '⚠ TC-032  pay with wallet: flaky, passed on retry',
          '✓ TC-040  order confirmation email sent',
          '✓ TC-041  order visible in "My Orders"',
          '✗ TC-042  cancel order within 24h: button missing on Safari',
          '    ↳ screenshot attached. dev says "Safari is not supported" (it is)',
          '✓ TC-050  EMI option shown for orders over ₹3000',
          '',
          'Summary: 13 passed · 3 failed · 1 flaky   (release still planned for Friday)',
          '',
          ''
        ].join('\n')
      },
      messages: {
        urgent: [
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Release blocked: sign-off needed NOW', busyText: 'Running the sign-off checklist…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Payment failing in prod. Reproduce it!', busyText: 'Reproducing the prod bug…' },
          { from: 'Jenkins', avatar: '🤖', text: 'Regression suite FAILED on release branch', busyText: 'Triaging the failed suite…' },
          { from: 'Release Manager', avatar: '📦', text: 'Go/no-go starting. Need test status.', busyText: 'Presenting the test status…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Client found a P1 bug in UAT', busyText: 'Logging the UAT P1…' },
          { from: 'Security Team', avatar: '🛡️', text: 'URGENT: retest the login vulnerability fix', busyText: 'Retesting the security fix…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: checkout broken after deploy', busyText: 'Confirming the checkout break…' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Hotfix ready. Verify before rollback deadline', busyText: 'Verifying the hotfix…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: orders not saving after deploy', busyText: 'Reproducing the order bug…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Rollback call NOW. Is the fix verified?', busyText: 'Confirming the fix…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'UAT blocked: nobody can log in', busyText: 'Unblocking UAT…' },
          { from: 'Jenkins', avatar: '🤖', text: 'Smoke tests FAILED in production', busyText: 'Checking production smoke tests…' },
          { from: 'Security Team', avatar: '🛡️', text: 'Pen test found SQL injection. Verify fix', busyText: 'Verifying the injection fix…' },
          { from: 'Release Manager', avatar: '📦', text: 'Release in 30 mins. Blockers?', busyText: 'Listing blockers…' }
        ],
        trivial: [
          { from: 'Meera · QA', avatar: '👩‍🔬', text: 'who broke staging again? 😂', favour: 'Meera' },
          { from: 'TestRail', avatar: '📑', text: 'Weekly test report is ready' },
          { from: 'Bug Bot', avatar: '🐞', text: "BUG-1204 marked won't fix" },
          { from: 'Automation Bot', avatar: '🤖', text: 'Nightly suite passed ✅' },
          { from: 'Test Env Bot', avatar: '🤖', text: 'Staging will restart at 6 PM' },
          { from: 'Sam · Automation', avatar: '🧑‍🔧', text: 'coffee? the good machine works again ☕', favour: 'Sam' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Just retest everything, small release 🙂', busyText: 'Retesting everything…', aftermath: "The 'small release' needed 312 test cases." },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Quick check? Works on my machine', busyText: "Checking on 'their machine'…", aftermath: 'It did not work on any other machine.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Quick call on test estimates? 2 mins', busyText: 'Estimating the estimates…', aftermath: "The '2-minute call' produced a 40-row spreadsheet." },
          { from: 'Onsite Client', avatar: '🌎', text: 'Just test on IE11 too, tiny ask', busyText: 'Hunting for an IE11 machine…', aftermath: 'There are no IE11 machines left. You found one anyway.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Only 10 test cases, quick one?', busyText: "Running 'only 10' test cases…", aftermath: 'The 10 test cases had 47 sub-steps.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Small fix, can you just verify?', busyText: "Verifying the 'small fix'…", aftermath: 'The small fix broke three other things.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick exploratory test before demo?', busyText: 'Exploring…', aftermath: 'You found 9 bugs. The demo went ahead anyway.' },
          { from: 'Release Manager', avatar: '📦', text: 'Just sign off, minor risk 🙏', busyText: 'Reading the release notes…', aftermath: "The 'minor risk' became Monday's incident." },
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick sanity test on all browsers?', busyText: 'Testing every browser…', aftermath: 'There were 11 browsers. Two of them were on smart fridges.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Just a one-line fix, test it?', busyText: "Testing a 'one-line' fix…", aftermath: 'The one line was 900 characters long.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Small favour: write test cases for sales?', busyText: 'Writing test cases for a sales demo…', aftermath: 'Sales used your test cases as the product brochure.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Only a tiny regression pass, please', busyText: "Running a 'tiny' regression…", aftermath: 'The tiny regression had 400 test cases.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Minor: can you update the test data?', busyText: 'Updating test data…', aftermath: 'The test data referenced a customer from 2009.' },
          { from: 'Release Manager', avatar: '📦', text: 'Quickly re-run the full suite?', busyText: 'Re-running the suite…', aftermath: 'The full suite takes six hours.' }
        ]
      }
    },

    analyst: {
      id: 'analyst',
      label: 'Analyst',
      emoji: '📊',
      tagline: 'Deliver the board report. Beware the "quick pivot table".',
      goal: 'Deliver the board report by lunch.',
      verb: 'analyse',
      doing: 'ANALYSING',
      deliverable: { noun: 'report', done: 'delivered' },
      progressLabel: 'Report',
      work: {
        file: 'analytics / revenue_by_region.sql',
        kind: 'sql',
        text: [
          '-- revenue_by_region.sql — for the "quick" board deck (due 11 AM, it\'s already 10)',
          '-- NOTE: finance and sales define "revenue" differently. asked. no reply.',
          '',
          'SELECT',
          '  r.region_name,',
          "  DATE_TRUNC('month', o.created_at)  AS month,",
          '  COUNT(DISTINCT o.id)               AS orders,',
          '  SUM(o.total - o.discount)          AS net_revenue,',
          '  SUM(o.total - o.discount) / NULLIF(COUNT(DISTINCT o.customer_id), 0) AS revenue_per_customer',
          'FROM orders o',
          'JOIN customers c ON c.id = o.customer_id',
          'JOIN regions   r ON r.id = c.region_id',
          "WHERE o.status = 'PAID'",
          "  AND o.created_at >= '2026-04-01'   -- financial year, not calendar year (learned the hard way)",
          '  AND c.is_test_account = FALSE      -- 40% of last quarter\'s "growth" was test accounts',
          'GROUP BY 1, 2',
          'ORDER BY net_revenue DESC;',
          '',
          '-- TODO: exclude the Pune pilot? ask Vikram. Vikram is on leave.',
          '-- sanity check: total should match the finance dashboard (it does not)',
          '',
          ''
        ].join('\n')
      },
      messages: {
        urgent: [
          { from: 'CFO Office', avatar: '💼', text: 'Board call starting. Need revenue numbers!', busyText: 'Pulling the revenue numbers…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Client dashboard showing wrong totals NOW', busyText: 'Fixing the dashboard totals…' },
          { from: 'Data Pipeline', avatar: '🤖', text: "ETL FAILED: today's data missing", busyText: 'Rerunning the ETL…' },
          { from: 'Onsite Client', avatar: '🌎', text: "Demo starting. Report won't load!", busyText: 'Rescuing the demo report…' },
          { from: 'Compliance Team', avatar: '⚖️', text: 'Regulatory report due today. Numbers mismatch.', busyText: 'Reconciling the numbers…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Prod query locking the database. Kill it!', busyText: 'Killing the runaway query…' },
          { from: 'Sales Head', avatar: '📈', text: 'Forecast wrong in investor deck. Fix now', busyText: 'Correcting the forecast…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: dashboard data stale for 6 hours', busyText: 'Refreshing the stale data…' },
          { from: 'CFO Office', avatar: '💼', text: 'Earnings numbers wrong in the press release', busyText: 'Correcting earnings numbers…' },
          { from: 'Data Pipeline', avatar: '🤖', text: 'FAILED: revenue table has duplicate rows', busyText: 'Removing duplicate rows…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'CEO presenting in 10 mins. Chart broken', busyText: "Fixing the CEO's chart…" },
          { from: 'Compliance Team', avatar: '⚖️', text: 'Audit today: customer PII found in reports', busyText: 'Removing personal data…' },
          { from: 'Sales Head', avatar: '📈', text: 'Commissions calculated wrong. Payroll runs today', busyText: 'Recalculating commissions…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: warehouse query burning all credits', busyText: 'Stopping the runaway query…' }
        ],
        trivial: [
          { from: 'Data Chat', avatar: '💬', text: 'Excel vs Python, round 12' },
          { from: 'Tableau', avatar: '📉', text: 'License renewal in 30 days' },
          { from: 'Rohit · Sales', avatar: '🧑‍💼', text: "thanks for last week's numbers 🙏", favour: 'Rohit' },
          { from: 'Report Bot', avatar: '🤖', text: 'Weekly dashboard refreshed ✅' },
          { from: 'BI Tool', avatar: '📉', text: 'Your dashboard was viewed 12 times' },
          { from: 'Maya · Data', avatar: '👩‍🔬', text: 'cake in the kitchen 🍰', favour: 'Maya' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick pivot table? 2 mins', busyText: "Building a 'quick' pivot…", aftermath: 'The pivot table became a 12-tab workbook.' },
          { from: 'Sales Head', avatar: '📈', text: 'Just add one small column 🙂', busyText: "Adding 'one small column'…", aftermath: 'The small column needed three new data sources.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Quick look? Only 5 mins', busyText: "Looking at 'the numbers'…", aftermath: '5 minutes, give or take the rest of the afternoon.' },
          { from: 'CFO Office', avatar: '💼', text: 'Just rerun everything with new assumptions, quickly', busyText: 'Rerunning with new assumptions…', aftermath: 'The assumptions changed again before you finished.' },
          { from: 'Neha · Marketing', avatar: '📣', text: 'Tiny favour: one quick chart?', busyText: "Making 'one chart'…", aftermath: 'One chart became a 30-slide deck.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Small doubt on the data model?', busyText: 'At the whiteboard…', aftermath: 'The small doubt became a data model redesign.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just a minor tweak to the dashboard', busyText: 'Tweaking the dashboard…', aftermath: 'The minor tweak broke every filter.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Quick ad-hoc report before lunch?', busyText: 'Building the ad-hoc report…', aftermath: 'Lunch was at 4 PM.' },
          { from: 'Sales Head', avatar: '📈', text: 'Quick forecast for a hypothetical market?', busyText: 'Forecasting a pretend market…', aftermath: 'The hypothetical market did not exist. Neither did the deadline.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just pull the numbers, tiny ask', busyText: "Pulling 'the numbers'…", aftermath: '"The numbers" meant every number since 2015.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Small tweak: switch the report to weekly?', busyText: 'Rebuilding the report weekly…', aftermath: 'Weekly became daily by Friday.' },
          { from: 'CFO Office', avatar: '💼', text: 'Only a minor restatement of last year', busyText: 'Restating last year…', aftermath: 'Last year is now different.' },
          { from: 'Neha · Marketing', avatar: '📣', text: 'Got a sec for my spreadsheet formula?', busyText: 'Untangling a formula…', aftermath: 'The formula was 11 nested IFs.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Quickly document every table we have?', busyText: 'Documenting tables…', aftermath: 'There are 3,400 tables. 3,000 are called temp.' }
        ]
      }
    },

    support: {
      id: 'support',
      label: 'Support Engineer',
      emoji: '🛟',
      tagline: 'Clear the ticket queue. Beware "just reproduce this".',
      goal: 'Clear the ticket queue by lunch.',
      verb: 'resolve',
      doing: 'RESOLVING',
      deliverable: { noun: 'ticket queue', done: 'cleared' },
      progressLabel: 'Ticket queue',
      work: {
        file: 'helpdesk / ticket #48213',
        kind: 'ticket',
        text: [
          'Ticket #48213 · Priority P2 · SLA: 3h 40m left · Customer mood: "very angry" (their words)',
          'Subject: Unable to download invoice — URGENT!!! (sent 7 times)',
          '',
          'Hi Mr. Sharma,',
          '',
          'Thank you for your patience, and sorry for the trouble with your invoice.',
          '',
          'I checked your account and found the download was blocked by an expired session.',
          "Here's what I've fixed on our side:",
          '  1. Cleared the stuck session on your account',
          '  2. Regenerated invoice INV-2026-0911-778',
          '  3. Sent a fresh copy to your registered email',
          '',
          'Could you please try again and confirm it works for you?',
          "If it still fails, just reply here and I'll set up a screen share.",
          '',
          'Warm regards,',
          'Support Team',
          '',
          '---- internal note ----',
          'Root cause: same session bug as #47990, #48001 and #48102.',
          'Asked dev for a permanent fix. ETA: "next sprint" (also said last sprint).',
          '',
          ''
        ].join('\n')
      },
      messages: {
        urgent: [
          { from: 'PagerDuty', avatar: '🚨', text: 'P1: customers cannot log in', busyText: 'Handling the login outage…' },
          { from: 'SLA Bot', avatar: '⏱️', text: 'SLA breach on ticket #48102 imminent', busyText: 'Rescuing the SLA…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Our payments are failing. Call NOW', busyText: 'On the client call…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'VIP customer escalated to CEO. Respond', busyText: 'Replying to the escalation…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: APAC region is down', busyText: 'Coordinating the outage…' },
          { from: 'Security Team', avatar: '🛡️', text: 'URGENT: customer data exposed. Escalate', busyText: 'Running the incident process…' },
          { from: 'Social Monitor', avatar: '📢', text: 'Viral complaint trending. Respond publicly', busyText: 'Drafting the public reply…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Hotfix live. Confirm with affected customers', busyText: 'Confirming with customers…' },
          { from: 'Phone Queue', avatar: '☎️', text: '47 callers waiting. Wait time 25 mins', busyText: 'Clearing the call queue…' },
          { from: 'Ops Bot', avatar: '🚨', text: 'P1: password reset emails not sending', busyText: 'Escalating email delivery…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Enterprise client threatening to churn today', busyText: 'Calling the client…' },
          { from: 'Security Team', avatar: '🛡️', text: 'Phishing email sent to customers. Warn them', busyText: 'Warning customers…' },
          { from: 'SLA Bot', avatar: '⏱️', text: 'Five P1 tickets unassigned for an hour', busyText: 'Assigning P1 tickets…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Invoices went to the wrong customers', busyText: 'Recalling invoices…' }
        ],
        trivial: [
          { from: 'Support Chat', avatar: '💬', text: 'Shift roster updated for next week' },
          { from: 'CSAT Bot', avatar: '⭐', text: 'You got a 5⭐ review!' },
          { from: 'Knowledge Base', avatar: '📚', text: '3 new articles published' },
          { from: 'Ticket Bot', avatar: '🤖', text: 'Ticket #47001 auto-closed ✅' },
          { from: 'Divya · Support', avatar: '👩‍💻', text: 'lunch at 1? 🍱', favour: 'Divya' },
          { from: 'Chat Widget Bot', avatar: '🤖', text: 'A customer rated your chat 👍' },
          { from: 'Tom · Support', avatar: '🧑', text: 'pizza for the night shift? 🍕', favour: 'Tom' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick call? Just explain the product', busyText: 'Giving an unplanned product demo…', aftermath: "The 'quick call' was a 90-minute sales demo." },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Just update the old runbook, small task', busyText: 'Rewriting the runbook…', aftermath: 'The runbook was last updated in 2019. Now you own it.' },
          { from: 'Neha · QA', avatar: '🧪', text: 'Quick question: can you just reproduce this?', busyText: 'Reproducing on every browser…', aftermath: "It only happens on the CEO's laptop." },
          { from: 'Onsite Client', avatar: '🌎', text: 'Tiny request: export all tickets, only CSV', busyText: 'Exporting 48,000 tickets…', aftermath: 'The CSV crashed Excel. Twice.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Small favour, check logs for a sec?', busyText: "Reading someone else's logs…", aftermath: 'Nobody knows whose logs they were.' },
          { from: 'Sales Head', avatar: '📈', text: 'Just quickly call this unhappy lead?', busyText: 'Calling an unhappy lead…', aftermath: 'They were not a customer. They were a competitor.' },
          { from: 'HR', avatar: '🗂️', text: 'Quick survey on support workload, 2 mins', busyText: "Filling a 'quick' survey…", aftermath: 'Question 1 of 64.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Only a minor bug, just triage it?', busyText: "Triaging the 'minor' bug…", aftermath: "The 'minor' bug was 200 duplicate tickets." },
          { from: 'Sales Head', avatar: '📈', text: "Quick demo for my friend's startup?", busyText: 'Demoing to a friend…', aftermath: "The friend's startup is a competitor." },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just tag all old tickets, small job', busyText: 'Tagging old tickets…', aftermath: 'There were 30,000 old tickets.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Tiny ask: test my fix on production?', busyText: 'Testing on production…', aftermath: 'You broke production. Arjun was at lunch.' },
          { from: 'HR', avatar: '🗂️', text: 'Only 20 mins: customer empathy training', busyText: 'In empathy training…', aftermath: 'It was 20 minutes per module. There were nine.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Quickly translate this error message?', busyText: 'Translating an error…', aftermath: 'The error message was in Latin. Nobody knows why.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Minor thing: recreate our lost report?', busyText: 'Recreating a lost report…', aftermath: 'The report was in their trash folder.' }
        ]
      }
    },

    manager: {
      id: 'manager',
      label: 'Manager',
      emoji: '🧭',
      tagline: 'Get the release plan approved. Beware the "quick sync".',
      goal: 'Get the release plan approved by lunch.',
      verb: 'plan',
      doing: 'PLANNING',
      deliverable: { noun: 'release plan', done: 'approved' },
      progressLabel: 'Release plan',
      work: {
        file: 'confluence / weekly-status.md',
        kind: 'doc',
        text: [
          '# Weekly Status — Payments Revamp     (RAG: 🟡 Amber, was 🟢 until Tuesday)',
          '',
          '## Summary',
          'Checkout redesign is 80% done (it has been 80% done for three weeks).',
          'UPI retry fix shipped Monday. Coupon bug found by QA, fix in progress.',
          '',
          '## Risks',
          '- Onsite client wants "just a small change" to the flow before UAT.',
          '- Two devs on leave next week (wedding season).',
          '- Blocked on the Auth team, who are blocked on us.',
          '',
          '## Asks',
          '- Approve 1 extra QA for regression.',
          '- Decide: move go-live by a week, or cut the EMI feature.',
          '',
          '## Team',
          '- Priya is carrying the release. Nominating her for a spot award.',
          '- Kiran blocked on environment access for 4 days. Escalated to IT (again).',
          '',
          '## Next week',
          'Sprint planning, sprint review, retro, and the meeting about the meetings.',
          '',
          ''
        ].join('\n')
      },
      messages: {
        urgent: [
          { from: 'Onsite Client', avatar: '🌎', text: 'Escalation: release slipped. Call me NOW', busyText: 'On the escalation call…' },
          { from: 'HR', avatar: '🗂️', text: 'Priya resigned. Need you right now', busyText: 'Having the retention conversation…' },
          { from: 'PagerDuty', avatar: '🚨', text: 'P1 outage. Leadership wants updates', busyText: 'Running the incident bridge…' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Budget cut announced. Need your plan today', busyText: 'Rebuilding the budget plan…' },
          { from: 'Release Manager', avatar: '📦', text: 'Go/no-go call started. Your decision', busyText: 'Making the go/no-go call…' },
          { from: 'Security Team', avatar: '🛡️', text: 'URGENT: audit finding on your project', busyText: 'Responding to the audit…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Team blocked: prod access revoked', busyText: 'Unblocking the team…' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Client threatening to cancel the contract', busyText: 'Saving the contract…' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Exec review moved to NOW. Bring numbers', busyText: 'Presenting to the execs…' },
          { from: 'HR', avatar: '🗂️', text: 'Team conflict escalated. HR needs you today', busyText: 'Meeting with HR…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Deadline moved up a week. Call me', busyText: 'Renegotiating the deadline…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Prod down and on-call engineer unreachable', busyText: 'Finding a backup on-call…' },
          { from: 'Finance', avatar: '🧾', text: 'Vendor invoice overdue. Service cut tomorrow', busyText: 'Approving the invoice…' },
          { from: 'Release Manager', avatar: '📦', text: 'Release failed. Roll back or fix forward?', busyText: 'Deciding on the rollback…' }
        ],
        trivial: [
          { from: 'LinkedIn', avatar: '🔗', text: 'Someone viewed your profile' },
          { from: 'HR', avatar: '🗂️', text: 'Team outing venue poll 🗳️' },
          { from: 'Finance', avatar: '🧾', text: 'Travel claims window is open' },
          { from: 'Calendar', avatar: '📅', text: 'Reminder: 1:1s start next week' },
          { from: 'Kavya · Designer', avatar: '👩‍🎨', text: 'coffee run? want one? ☕', favour: 'Kavya' },
          { from: 'Calendar', avatar: '📅', text: 'Your 3 PM was moved to 3:30' },
          { from: 'Nina · Scrum Master', avatar: '🧑‍🏫', text: 'retro snacks: cookies or fruit? 🍪', favour: 'Nina' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick sync to plan the planning?', busyText: 'Planning the planning…', aftermath: 'You planned the planning. It now needs a planning session.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Just a small deck for leadership', busyText: "Making a 'small' deck…", aftermath: 'The small deck went through 11 versions.' },
          { from: 'HR', avatar: '🗂️', text: 'Quick interview? Only 30 mins', busyText: 'Interviewing a candidate…', aftermath: 'It was a 5-round panel. You were all 5 rounds.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Tiny scope change, very minor 🙏', busyText: "Re-planning the 'tiny' change…", aftermath: 'The tiny scope change doubled the timeline.' },
          { from: 'Ramesh · Peer Manager', avatar: '👨‍💼', text: "Just review my team's appraisals quickly?", busyText: "Reviewing someone else's appraisals…", aftermath: 'You now have 14 appraisals to calibrate.' },
          { from: 'Finance', avatar: '🧾', text: 'Quick question on budget, got a sec?', busyText: 'Explaining the budget…', aftermath: 'The quick question became a full re-forecast.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Small doubt on the roadmap, free?', busyText: 'Debating the roadmap…', aftermath: 'The roadmap now has a roadmap.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Just approve this minor process change', busyText: "Reading the 'minor' process…", aftermath: 'The process change added three approval steps, including yours.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Quick vote on the team name?', busyText: 'Voting on a team name…', aftermath: 'The team is now called "The Synergists".' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Just a small reorg of your team', busyText: "Planning a 'small' reorg…", aftermath: 'The small reorg moved everyone except you.' },
          { from: 'HR', avatar: '🗂️', text: 'Only 10 questions: engagement survey for managers', busyText: 'Filling in a manager survey…', aftermath: 'Question 10 had 40 sub-questions.' },
          { from: 'Finance', avatar: '🧾', text: 'Minor thing: re-sign all expense reports?', busyText: 'Re-signing expense reports…', aftermath: 'There were 212 expense reports.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Quickly approve my conference trip?', busyText: 'Reviewing a conference trip…', aftermath: 'The conference is on a beach. For two weeks.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Small ask: weekly status as a video?', busyText: 'Recording a status video…', aftermath: 'Nobody watched the video. They asked for a doc.' }
        ]
      }
    }
  };

  // Every role's small talk includes the shared personal messages.
  for (const id of ROLE_ORDER) ROLES[id].messages.trivial = ROLES[id].messages.trivial.concat(SHARED_TRIVIAL);

  // ---- Career levels ----
  // As your career grows, traps stop giving themselves away. The rules and timing never change; only
  // how well a trap hides, and so which reading skill a level tests:
  //
  //   junior  Traps minimise ("quick", "just", "small"). The keyword is the tell. (The messages above.)
  //   senior  Traps drop the minimising words and become polite, open-ended asks with nothing actually
  //           wrong ("Whenever you get a moment, thoughts?"). Reading for "quick" no longer works: ask
  //           whether there is a real problem and a real deadline. Urgent messages stay as at junior.
  //   lead    Traps borrow alarm words (URGENT, ASAP, "important!!") while real emergencies are calm and
  //           concrete ("Checkout errors climbing since your deploy"). Now alarm words mislead too: ask
  //           what is actually broken, and who is waiting.
  //
  // TELLS are the keyword patterns involved. test/career.test.js holds every level to them, and checks
  // with keyword-only bots (bots.js) that each promotion breaks the shortcut from the level before.
  // All career wording is plain English with no local references, so it works for any audience.
  const TELLS = {
    minimising: /\b(quick|quickly|just|small|tiny|only|sec|minor)\b/i,
    alarm: /\b(urgent|urgently|asap|now|immediate|immediately|critical|important|emergency|priority)\b|!/i
  };

  const LEVEL_ORDER = ['junior', 'senior', 'lead'];
  const LEVELS = {
    junior: {
      id: 'junior', label: 'Junior', emoji: '🌱',
      summary: 'Traps give themselves away.',
      tell: 'Anything <i>quick</i>, <i>small</i> or <i>just 2 mins</i> never is.',
      trapPop: 'It was not quick.'
    },
    senior: {
      id: 'senior', label: 'Senior', emoji: '🚀',
      summary: 'Traps stop saying "quick". Is anything actually wrong?',
      unlockText: 'Get a 🥇 as a Junior, in any role, to unlock.',
      tell: 'Senior traps never say <i>quick</i>. They are polite, open-ended asks with nothing actually wrong: <i>"whenever you get a moment"</i>, <i>"thoughts?"</i>',
      trapPop: 'Nothing was actually wrong.'
    },
    lead: {
      id: 'lead', label: 'Lead', emoji: '👑',
      summary: 'Traps shout URGENT. Real emergencies stay calm.',
      unlockText: 'Get a 🥇 as a Senior, in any role, to unlock.',
      tell: 'Lead traps shout <i>URGENT</i> and <i>ASAP</i>, while real emergencies are often calm. Ask what is actually broken, and who is waiting.',
      trapPop: 'The only emergency was their deadline.'
    }
  };

  // Per role: senior traps, and lead urgent messages and traps. Every level shares the role's small talk.
  const CAREER = {
    developer: {
      senior: {
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Whenever you get a moment, thoughts?', busyText: 'Having thoughts…', aftermath: 'Your thoughts became a 3-page design doc.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Can you look into this pattern?', busyText: 'Looking into the pattern…', aftermath: 'The pattern was fine. Now it is a refactor.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Would love your eyes on the roadmap', busyText: 'Reviewing the roadmap…', aftermath: 'You are now the owner of the roadmap.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Can you mentor the new joiner today?', busyText: 'Onboarding the new joiner…', aftermath: 'The new joiner is lovely. Your feature is not done.' },
          { from: 'Neha · QA', avatar: '🧪', text: 'Curious why this test is flaky', busyText: 'Chasing a flaky test…', aftermath: 'It was a timezone bug. It is always a timezone bug.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Could we explore a different approach?', busyText: 'Exploring approaches…', aftermath: 'You explored three approaches. The client picked the original.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Could you prototype a few more options?', busyText: 'Prototyping options…', aftermath: 'You built four prototypes. The meeting chose none.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Would you write up a tech proposal?', busyText: 'Writing a proposal…', aftermath: 'The proposal is now in review. Forever.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Thoughts on switching frameworks next year?', busyText: 'Comparing frameworks…', aftermath: 'You compared six frameworks. Nobody is switching.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Can you investigate why builds feel slower?', busyText: 'Profiling the build…', aftermath: 'Builds are 3 seconds faster. Your feature is not done.' },
          { from: 'Neha · QA', avatar: '🧪', text: 'Would love your view on test coverage', busyText: 'Discussing test coverage…', aftermath: 'Coverage went up 1%. The meeting took 2 hours.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Can we talk through the architecture again?', busyText: 'Redrawing the architecture…', aftermath: 'Same architecture. New diagram.' }
        ]
      },
      lead: {
        urgent: [
          { from: 'Ops Bot', avatar: '📈', text: 'Checkout errors climbing since your deploy', busyText: 'Rolling back the deploy…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Release is waiting on your approval', busyText: 'Approving the release…' },
          { from: 'Security Team', avatar: '🛡️', text: 'Your token leaked in a public repo', busyText: 'Revoking the token…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Demo is in ten minutes; build fails', busyText: 'Fixing the demo build…' },
          { from: 'Database Bot', avatar: '🗄️', text: 'Disk at 97% on the payments database', busyText: 'Freeing disk space…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Customers are being charged twice', busyText: 'Stopping double charges…' },
          { from: 'Ops Bot', avatar: '📈', text: 'Login latency tripled after the config change', busyText: 'Reverting the config…' },
          { from: 'Release Manager', avatar: '📦', text: 'Your migration is locking the orders table', busyText: 'Stopping the migration…' },
          { from: 'Security Team', avatar: '🛡️', text: 'Unpatched library found on the payment servers', busyText: 'Patching the library…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Team is blocked on your API change', busyText: 'Unblocking the team…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Our users see blank pages since 9', busyText: 'Fixing the blank pages…' },
          { from: 'Database Bot', avatar: '🗄️', text: 'Backups have failed for three nights', busyText: 'Fixing the backups…' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'URGENT: need estimates for next quarter', busyText: 'Estimating next quarter…', aftermath: 'Next quarter was replanned the following week.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Important: update your Jira tickets ASAP', busyText: 'Grooming Jira tickets…', aftermath: 'The tickets are beautiful. Nothing shipped.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Critical: should we rename every microservice?', busyText: 'Renaming microservices…', aftermath: 'The services have new names. They do the same things.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'ASAP!! Button colour looks off', busyText: 'Adjusting the button colour…', aftermath: 'It was their monitor.' },
          { from: 'HR', avatar: '🗂️', text: 'Immediate action: complete compliance training', busyText: 'Watching compliance videos…', aftermath: 'The deadline was the end of the month. It was the 2nd.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Emergency sync on the code style guide', busyText: 'Syncing on the style guide…', aftermath: 'The style guide now has a style guide.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'ASAP: dark mode for the admin page', busyText: 'Adding dark mode…', aftermath: 'Three people use the admin page. None of them asked.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'URGENT: fill in your timesheet for March', busyText: 'Filling in timesheets…', aftermath: 'The timesheet system was down anyway.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Critical!! Rewrite the README, new tone', busyText: 'Rewriting the README…', aftermath: 'The README now has a brand voice.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Important: debate REST versus GraphQL today', busyText: 'Debating REST and GraphQL…', aftermath: 'The debate continues in a new channel.' },
          { from: 'HR', avatar: '🗂️', text: 'Priority: update your profile photo', busyText: 'Taking a profile photo…', aftermath: 'You took 30 photos. You used the old one.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Emergency: can the logo be bigger?', busyText: 'Making the logo bigger…', aftermath: 'Now they want it smaller.' }
        ]
      }
    },

    tester: {
      senior: {
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Could you also cover the edge cases?', busyText: 'Covering edge cases…', aftermath: 'There were 212 edge cases. You found them all.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Can you check if this still happens?', busyText: 'Checking if it still happens…', aftermath: 'It still happens. It will always happen.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Thoughts on automating the whole suite?', busyText: 'Planning full automation…', aftermath: 'The automation plan needs its own test plan.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'When you get a chance, test performance', busyText: 'Load testing…', aftermath: 'You load tested staging into the ground.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Would you document every test case?', busyText: 'Writing test documentation…', aftermath: 'Nobody will read the 90-page document.' },
          { from: 'Release Manager', avatar: '📦', text: 'Can we revisit the test strategy?', busyText: 'Revisiting the strategy…', aftermath: 'The strategy was revisited. Then revisited again.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Could you also test the legacy app?', busyText: 'Testing the legacy app…', aftermath: 'The legacy app was retired in April.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Thoughts on a new bug severity scale?', busyText: 'Designing severity levels…', aftermath: 'There are now seven severities. Everything is a 3.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Can you pair with me on this?', busyText: 'Pairing with Arjun…', aftermath: 'You wrote the fix. Arjun got the credit.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Walk us through the test results sometime?', busyText: 'Presenting test results…', aftermath: 'They asked for the same walkthrough next week.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Worth exploring a new testing tool?', busyText: 'Evaluating testing tools…', aftermath: 'You evaluated five tools and kept the old one.' },
          { from: 'Neha · Marketing', avatar: '📣', text: 'Can you review our launch video?', busyText: 'Reviewing a launch video…', aftermath: 'You found 9 typos in the subtitles.' }
        ]
      },
      lead: {
        urgent: [
          { from: 'Release Manager', avatar: '📦', text: 'Release goes out at noon without sign-off', busyText: 'Signing off the release…' },
          { from: 'Support Lead', avatar: '🛟', text: 'Customers report payments declined since release', busyText: 'Reproducing the declines…' },
          { from: 'Automation Bot', avatar: '🤖', text: 'Login tests failing on the release branch', busyText: 'Investigating the login tests…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Sign-off meeting started; the team is waiting', busyText: 'Joining the sign-off meeting…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Rollback decision needs your test results', busyText: 'Sharing test results…' },
          { from: 'Security Team', avatar: '🛡️', text: 'Patch deploys today; please verify the fix', busyText: 'Verifying the security patch…' },
          { from: 'Ops Bot', avatar: '📈', text: 'Error rate doubled since the 10:30 deploy', busyText: 'Isolating the failing change…' },
          { from: 'Release Manager', avatar: '📦', text: 'App store submission closes at noon', busyText: 'Testing the store build…' },
          { from: 'Automation Bot', avatar: '🤖', text: 'Payment tests fail on every device', busyText: 'Investigating payment tests…' },
          { from: 'Support Lead', avatar: '🛟', text: 'Refunds are charging customers instead', busyText: 'Reproducing the refund bug…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Hotfix is waiting on your sign-off', busyText: 'Signing off the hotfix…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Our auditors found data in wrong accounts', busyText: 'Checking the data mix-up…' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: "URGENT: retest last year's release notes", busyText: 'Retesting old release notes…', aftermath: "Last year's release was fine. It was last year." },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Top priority: rename every test case', busyText: 'Renaming test cases…', aftermath: 'All 1,400 test cases follow the new naming. Nobody noticed.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'ASAP: test it on my personal phone!', busyText: 'Testing on a 2015 phone…', aftermath: "The client's phone was in airplane mode." },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Important!! Can you verify my typo fix?', busyText: 'Verifying a typo fix…', aftermath: 'The typo fix was in a comment.' },
          { from: 'HR', avatar: '🗂️', text: 'Immediate: nominate a QA team mascot', busyText: 'Choosing a mascot…', aftermath: 'The mascot is a bug. Everyone agreed.' },
          { from: 'Release Manager', avatar: '📦', text: 'Critical: fill in the test metrics sheet', busyText: 'Filling in metrics…', aftermath: 'The sheet feeds a dashboard nobody opens.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'URGENT: estimate testing for 2028', busyText: 'Estimating 2028…', aftermath: 'The 2028 roadmap was cancelled.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Critical: update the QA wiki fonts', busyText: 'Changing wiki fonts…', aftermath: 'Nobody reads the wiki. It looks great.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Important!! Test our holiday party invite', busyText: 'Testing a party invite…', aftermath: 'The invite had the wrong date. You found it.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'ASAP: why does my laptop fan spin?', busyText: "Listening to Arjun's laptop fan…", aftermath: 'It was 47 browser tabs.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Priority: summarise quality in one emoji', busyText: 'Choosing an emoji…', aftermath: 'You chose 😐. Leadership was concerned.' },
          { from: 'HR', avatar: '🗂️', text: 'Emergency!! Badge photo retakes today', busyText: 'Retaking a badge photo…', aftermath: 'The new photo is worse.' }
        ]
      }
    },

    analyst: {
      senior: {
        trap: [
          { from: 'Sales Head', avatar: '📈', text: 'Can you slice this by every region?', busyText: 'Slicing by region…', aftermath: 'There are 47 regions. The chart is unreadable.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Wondering if the data tells a story', busyText: 'Looking for a story…', aftermath: 'The data told several stories. Vikram picked his favourite.' },
          { from: 'CFO Office', avatar: '💼', text: 'Could you sanity-check these assumptions?', busyText: 'Checking assumptions…', aftermath: 'The assumptions were wrong. You rebuilt the model.' },
          { from: 'Neha · Marketing', avatar: '📣', text: 'Whenever free, explore the campaign data?', busyText: 'Exploring campaign data…', aftermath: 'You explored for three hours and found nothing.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Thoughts on moving everything to a lakehouse?', busyText: 'Thinking about lakehouses…', aftermath: 'Nobody could define "lakehouse". There is a committee.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Can we align the dashboard definitions?', busyText: 'Aligning definitions…', aftermath: 'Finance and Sales still define revenue differently.' },
          { from: 'Sales Head', avatar: '📈', text: 'Could you build a model for everything?', busyText: 'Modelling everything…', aftermath: 'The model of everything predicts more meetings.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Would love a deeper dive into churn', busyText: 'Diving into churn…', aftermath: 'You dove deep. Vikram skimmed the summary.' },
          { from: 'CFO Office', avatar: '💼', text: 'Can we explore a few more scenarios?', busyText: 'Running scenarios…', aftermath: 'Scenario 14 was the same as scenario 2.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Thoughts on a data literacy workshop?', busyText: 'Planning a workshop…', aftermath: 'You now run the workshop. Every month.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'When you can, review the new schema', busyText: 'Reviewing the schema…', aftermath: 'The new schema is the old schema, renamed.' },
          { from: 'Neha · Marketing', avatar: '📣', text: 'Curious what our survey data says', busyText: 'Reading survey data…', aftermath: 'The survey says people like surveys less.' }
        ]
      },
      lead: {
        urgent: [
          { from: 'CFO Office', avatar: '💼', text: 'Board deck numbers disagree with finance', busyText: 'Reconciling the board deck…' },
          { from: 'Data Pipeline', avatar: '🤖', text: 'Nightly load stopped; dashboards show yesterday', busyText: 'Restarting the nightly load…' },
          { from: 'Compliance Team', avatar: '⚖️', text: 'Regulator filing closes at 5 PM today', busyText: 'Finishing the filing…' },
          { from: 'Sales Head', avatar: '📈', text: 'Investor call started; forecast link broken', busyText: 'Fixing the forecast link…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Your query is slowing the production database', busyText: 'Stopping the query…' },
          { from: 'Onsite Client', avatar: '🌎', text: "Our dashboard shows another client's data", busyText: 'Locking down the dashboard…' },
          { from: 'CFO Office', avatar: '💼', text: 'Quarter close is waiting on your reconciliation', busyText: 'Finishing the reconciliation…' },
          { from: 'Data Pipeline', avatar: '🤖', text: 'Currency rates stopped updating yesterday', busyText: 'Fixing the currency feed…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Pricing dashboard shows prices ten times higher', busyText: 'Fixing the pricing data…' },
          { from: 'Compliance Team', avatar: '⚖️', text: 'Customer deletion requests missed their deadline', busyText: 'Processing deletion requests…' },
          { from: 'Sales Head', avatar: '📈', text: "Board members see last quarter's numbers", busyText: 'Refreshing the board deck…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Your export is filling the shared disk', busyText: 'Stopping the export…' }
        ],
        trap: [
          { from: 'Sales Head', avatar: '📈', text: 'URGENT: make the chart more exciting', busyText: 'Making the chart exciting…', aftermath: 'The chart is now 3D. It is worse.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'ASAP: count every button click ever', busyText: 'Counting clicks…', aftermath: 'Nobody needed the click count.' },
          { from: 'CFO Office', avatar: '💼', text: 'Important: recolour the charts to brand blue', busyText: 'Recolouring charts…', aftermath: 'The brand blue changed the next day.' },
          { from: 'Neha · Marketing', avatar: '📣', text: 'Emergency!! Our post got 4 likes', busyText: 'Analysing 4 likes…', aftermath: 'Two of the likes were from the team.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Critical: rename the dashboard tabs', busyText: 'Renaming dashboard tabs…', aftermath: 'The old tab names were better.' },
          { from: 'HR', avatar: '🗂️', text: 'Priority: analyse the cafeteria survey', busyText: 'Analysing cafeteria feedback…', aftermath: 'The cafeteria feedback, in full: more coffee.' },
          { from: 'Sales Head', avatar: '📈', text: 'URGENT: which month had the best weather?', busyText: 'Correlating weather and sales…', aftermath: 'There was no correlation. There rarely is.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Critical!! Pie chart or donut chart?', busyText: 'Choosing chart shapes…', aftermath: 'Donut. Obviously. It took an hour.' },
          { from: 'CFO Office', avatar: '💼', text: 'ASAP: round every number to millions', busyText: 'Rounding numbers…', aftermath: 'Now everything is zero million.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Important: add emojis to the KPI report', busyText: 'Adding emojis…', aftermath: 'Every KPI is now a sad face.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Priority: a dashboard of our dashboards', busyText: 'Building a dashboard of dashboards…', aftermath: 'The dashboard of dashboards has no users.' },
          { from: 'HR', avatar: '🗂️', text: 'Immediate: count the office plants', busyText: 'Counting plants…', aftermath: 'There are 41 plants. Three are plastic.' }
        ]
      }
    },

    support: {
      senior: {
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'Could you write an FAQ for this?', busyText: 'Writing an FAQ…', aftermath: 'The FAQ has 64 questions. Nobody reads it.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Thoughts on redesigning our ticket categories?', busyText: 'Redesigning categories…', aftermath: 'There are now 212 categories, including "Other".' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Can you gather more logs from customers?', busyText: 'Collecting logs…', aftermath: 'Customers sent screenshots of the logs.' },
          { from: 'Sales Head', avatar: '📈', text: 'Would you join the prospect call?', busyText: 'On a sales call…', aftermath: 'You answered every question. Sales got the credit.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'When you can, reproduce this old issue', busyText: 'Reproducing a 2-year-old issue…', aftermath: 'The old issue was fixed two years ago.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Can you walk our new hire through?', busyText: 'Training their new hire…', aftermath: 'Their new hire now emails you directly.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Could you collect feature ideas from customers?', busyText: 'Collecting feature ideas…', aftermath: 'Customers want the feature that was removed last year.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Would you rewrite our tone of voice?', busyText: 'Rewriting the tone of voice…', aftermath: 'The new tone is "friendly but firm". Nobody can do it.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Any pattern in these tickets, you think?', busyText: 'Looking for patterns…', aftermath: 'The pattern was Mondays.' },
          { from: 'Sales Head', avatar: '📈', text: 'Thoughts on upselling during support calls?', busyText: 'Writing an upsell script…', aftermath: 'Customers now hang up faster.' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'When free, review the error codes list', busyText: 'Reviewing error codes…', aftermath: 'Error 4012 means "unknown error". So does 4013.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Could your team visit our office sometime?', busyText: 'Planning a site visit…', aftermath: 'The visit is in another timezone. You are going.' }
        ]
      },
      lead: {
        urgent: [
          { from: 'SLA Bot', avatar: '⏱️', text: 'Three enterprise tickets breach SLA at 11', busyText: 'Saving the SLA…' },
          { from: 'Ops Bot', avatar: '📈', text: 'Login failures rising for all EU customers', busyText: 'Coordinating the login issue…' },
          { from: 'Security Team', avatar: '🛡️', text: 'A customer sent their password in chat', busyText: 'Scrubbing the password…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Our checkout has shown errors since 10', busyText: 'On the client call…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'Biggest customer is cancelling this afternoon', busyText: 'Calling the customer…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Fix is live; affected customers need updates', busyText: 'Updating customers…' },
          { from: 'Phone Queue', avatar: '☎️', text: 'Phone lines stopped connecting at 10:15', busyText: 'Restoring phone lines…' },
          { from: 'SLA Bot', avatar: '⏱️', text: 'Largest account has waited two days', busyText: 'Answering the largest account…' },
          { from: 'Security Team', avatar: '🛡️', text: "Agents can see other customers' card numbers", busyText: 'Restricting agent access…' },
          { from: 'Ops Bot', avatar: '📈', text: 'Mobile app crashes on launch for everyone', busyText: 'Coordinating the crash response…' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'A reporter is asking about the outage', busyText: 'Preparing a statement…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Our staff cannot process refunds today', busyText: 'Unblocking refunds…' }
        ],
        trap: [
          { from: 'Sales Head', avatar: '📈', text: 'URGENT: prospect wants a feature tour', busyText: 'Giving a feature tour…', aftermath: 'The prospect was a student writing an essay.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'ASAP: tidy up the ticket tags', busyText: 'Tidying tags…', aftermath: 'The tags are tidy. The queue is not.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Critical!! Our logo looks blurry', busyText: 'Investigating a blurry logo…', aftermath: 'They had zoomed to 400%.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Important: rate every canned response', busyText: 'Rating canned responses…', aftermath: 'All 300 responses are rated "fine".' },
          { from: 'HR', avatar: '🗂️', text: 'Immediate: book your mandatory fun session', busyText: 'Booking mandatory fun…', aftermath: 'Mandatory fun is on Saturday.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Emergency: which font do customers prefer?', busyText: 'Surveying font preferences…', aftermath: 'Customers do not care about fonts.' },
          { from: 'Sales Head', avatar: '📈', text: 'URGENT: customer wants a birthday discount', busyText: 'Negotiating a birthday discount…', aftermath: 'It was not their birthday.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Critical: rename "tickets" to "journeys"', busyText: 'Renaming tickets to journeys…', aftermath: 'Customers now open journeys. Nothing else changed.' },
          { from: 'Ramesh · Manager', avatar: '👨‍💼', text: 'ASAP!! New signature for every email', busyText: 'Updating email signatures…', aftermath: 'The new signature is longer than most replies.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Important: rank customers by vibe', busyText: 'Ranking customers by vibe…', aftermath: 'Nobody could define vibe.' },
          { from: 'HR', avatar: '🗂️', text: 'Priority!! Choose your team hoodie size', busyText: 'Choosing a hoodie size…', aftermath: 'The hoodies arrived in one size.' },
          { from: 'Arjun · Dev', avatar: '🧑‍💻', text: 'Emergency: is our favicon too blue?', busyText: 'Studying the favicon…', aftermath: 'The favicon is fine. It was always fine.' }
        ]
      }
    },

    manager: {
      senior: {
        trap: [
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Can you think about our team vision?', busyText: 'Thinking about the vision…', aftermath: 'The vision statement took all afternoon. It says "Excellence".' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Would love your input on the backlog', busyText: 'Reviewing the backlog…', aftermath: 'The backlog is 900 items long. It is still 900 items long.' },
          { from: 'HR', avatar: '🗂️', text: 'Could you draft the new career framework?', busyText: 'Drafting a career framework…', aftermath: 'The framework has 11 levels. You are on level 4.' },
          { from: 'Finance', avatar: '🧾', text: 'Can we revisit the headcount forecast?', busyText: 'Revisiting headcount…', aftermath: 'The forecast was revisited. The headcount was not.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Worth discussing our long-term tech strategy?', busyText: 'Discussing tech strategy…', aftermath: 'The long-term strategy is to discuss it again next quarter.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'When convenient, walk us through the process', busyText: 'Walking through the process…', aftermath: 'You explained the process. They proposed a new one.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Could you mentor two other managers?', busyText: 'Mentoring managers…', aftermath: 'Your mentees now forward you their problems.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'Would you rethink our sprint process?', busyText: 'Rethinking sprints…', aftermath: 'Sprints are now called cycles. They are the same.' },
          { from: 'HR', avatar: '🗂️', text: 'Can you lead the culture committee?', busyText: 'Leading the culture committee…', aftermath: 'The culture committee has a culture problem.' },
          { from: 'Finance', avatar: '🧾', text: 'Thoughts on tracking time per task?', busyText: 'Designing time tracking…', aftermath: 'Everyone now spends 10% of their time tracking time.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'When convenient, align the teams on tooling', busyText: 'Aligning teams on tooling…', aftermath: 'Every team agreed to use a different tool.' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Can we explore a joint innovation lab?', busyText: 'Exploring an innovation lab…', aftermath: 'The lab has a logo. It has no projects.' }
        ]
      },
      lead: {
        urgent: [
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'Two engineers blocked since morning on access', busyText: 'Unblocking access…' },
          { from: 'Onsite Client', avatar: '🌎', text: "Renewal depends on how today's demo goes", busyText: 'Preparing the demo…' },
          { from: 'HR', avatar: '🗂️', text: 'Your top engineer has an offer elsewhere', busyText: 'Having the retention talk…' },
          { from: 'Release Manager', avatar: '📦', text: 'Go-live is paused until you decide', busyText: 'Making the go-live call…' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Budget freezes unless your plan lands today', busyText: 'Finishing the plan…' },
          { from: 'Security Team', avatar: '🛡️', text: 'A former employee still has admin access', busyText: 'Revoking access…' },
          { from: 'Priya · Tech Lead', avatar: '👩‍💻', text: 'On-call engineer has worked 20 hours straight', busyText: 'Arranging relief for on-call…' },
          { from: 'Finance', avatar: '🧾', text: 'Contractor payroll fails without your approval', busyText: 'Approving payroll…' },
          { from: 'Onsite Client', avatar: '🌎', text: 'Our CTO wants a call before signing', busyText: 'Calling their CTO…' },
          { from: 'Release Manager', avatar: '📦', text: 'Two teams deployed conflicting changes this morning', busyText: 'Sorting out the conflict…' },
          { from: 'HR', avatar: '🗂️', text: 'New joiner starts today with no laptop', busyText: 'Finding a laptop…' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Headcount decision closes at 4 today', busyText: 'Making the headcount case…' }
        ],
        trap: [
          { from: 'Vikram · PM', avatar: '📋', text: 'URGENT: rename the sprint to "Phoenix"', busyText: 'Renaming the sprint…', aftermath: 'Sprint Phoenix delivered what Sprint 14 would have.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'Critical: new slide template for all decks', busyText: 'Moving decks to the new template…', aftermath: 'The template changed again on Monday.' },
          { from: 'Finance', avatar: '🧾', text: 'ASAP: explain a coffee expense from March', busyText: 'Explaining a coffee expense…', aftermath: 'It was a coffee.' },
          { from: 'HR', avatar: '🗂️', text: 'Important!! Team photo for the intranet', busyText: 'Organising a team photo…', aftermath: 'Half the team was remote. It is a collage.' },
          { from: 'Ramesh · Peer Manager', avatar: '👨‍💼', text: 'Top priority: settle our meeting room dispute', busyText: 'Mediating a room dispute…', aftermath: 'You lost the meeting room.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Emergency review of our org chart icons', busyText: 'Reviewing org chart icons…', aftermath: 'The icons are now circles instead of squares.' },
          { from: 'Vikram · PM', avatar: '📋', text: 'URGENT: pick a new channel emoji', busyText: 'Picking an emoji…', aftermath: 'The channel emoji is 🦄. It was already 🦄.' },
          { from: 'Director · Anita', avatar: '👩‍💼', text: 'ASAP: one-page summary of the summary', busyText: 'Summarising the summary…', aftermath: 'The summary of the summary was one sentence.' },
          { from: 'HR', avatar: '🗂️', text: 'Critical!! Order the office holiday decorations', busyText: 'Ordering decorations…', aftermath: 'The decorations arrived in February.' },
          { from: 'Finance', avatar: '🧾', text: 'Important: why did pens cost more?', busyText: 'Investigating pen costs…', aftermath: 'They were nicer pens.' },
          { from: 'Ramesh · Peer Manager', avatar: '👨‍💼', text: 'Priority: swap desks with my team?', busyText: 'Negotiating desks…', aftermath: 'You moved desks. Their team moved back.' },
          { from: 'Arjun · Architect', avatar: '🏛️', text: 'Emergency!! Name the new meeting rooms', busyText: 'Naming meeting rooms…', aftermath: 'The rooms are named after planets. Pluto is a cupboard.' }
        ]
      }
    }
  };

  // Each role's full message set at each level. `messages` above stays the junior set.
  for (const id of ROLE_ORDER) {
    const junior = ROLES[id].messages;
    const career = CAREER[id];
    ROLES[id].byLevel = {
      junior,
      senior: { urgent: junior.urgent, trivial: junior.trivial, trap: career.senior.trap },
      lead: { urgent: career.lead.urgent, trivial: junior.trivial, trap: career.lead.trap }
    };
  }

  // One line per kind of interruption. 'decline' is deliberately the same for every message type:
  // saying no must not tell you what you just said no to.
  const BUSY_TEXT = { urgent: 'Handling it…', trivial: 'Replying…', trap: 'Stuck…', decline: 'Writing a polite no…' };

  // ---- Boss of the day, office events and follow-ups (rules in core.js) ----
  const BOSSES = {
    reasonable: { id: 'reasonable', label: 'The Reasonable One', short: 'Reasonable One', emoji: '😌', summary: 'A normal morning. Enjoy it while it lasts.' },
    micromanager: { id: 'micromanager', label: 'The Micromanager', short: 'Micromanager', emoji: '🔍', summary: 'More urgent messages than usual. Most of them are real.' },
    lastminute: { id: 'lastminute', label: 'The Last-Minute Boss', short: 'Last-Minute Boss', emoji: '⌛', summary: 'A quiet morning. Then everything lands at noon.' },
    nicetrap: { id: 'nicetrap', label: 'The Nice Trap', short: 'Nice Trap', emoji: '🙂', summary: 'More traps than usual, all asked very politely.' }
  };

  const EVENTS = {
    drill: { id: 'drill', emoji: '🔥', title: 'Fire drill!', hint: "Everyone out. Work and messages wait, but your focus doesn't." },
    wifi: { id: 'wifi', emoji: '📶', title: 'Wi-Fi is down', hint: 'No messages for a while. Work fast: they will all land at once.' },
    walkby: { id: 'walkby', emoji: '👀', title: 'Boss walking by', hint: 'Look busy: keep working, and stay off pointless calls.' },
    outage: { id: 'outage', emoji: '🚨', title: 'Outage!', hint: 'A burst of real emergencies is on its way.' },
    lunch: { id: 'lunch', emoji: '🍕', title: 'Lunch has arrived', hint: 'Colleagues are chatty. A good time to bank favours.' }
  };

  // An ignored trap comes back once, pushier, and still follows its level's tell. An unanswered urgent
  // message comes back once as an escalation from the boss: calm and concrete, so it reads as urgent at
  // every level. test/events.test.js holds these to the same rules as every other message.
  const ESCALATIONS = [
    { text: 'Escalated: this is still not handled', busyText: 'Handling the escalation…' },
    { text: 'Customers are still waiting on this', busyText: 'Handling the escalation…' },
    { text: 'Leadership is asking why this is open', busyText: 'Explaining it to leadership…' }
  ];
  const FOLLOW_UPS = {
    junior: {
      trap: [
        { text: 'Just following up, quick one? 🙂', busyText: "Doing the 'quick one' after all…", aftermath: 'You dodged it once. The follow-up got you.' },
        { text: 'Only a small nudge on my ask', busyText: 'Giving in to the nudge…', aftermath: 'The small nudge became a long afternoon.' },
        { text: 'Quick reminder about my tiny request', busyText: "Doing the 'tiny request'…", aftermath: 'You said no once. Then you said yes.' }
      ],
      urgent: ESCALATIONS
    },
    senior: {
      trap: [
        { text: 'Circling back on my earlier message', busyText: 'Circling back…', aftermath: 'They circled back. You got pulled in.' },
        { text: 'Any thoughts on this yet?', busyText: 'Sharing your thoughts after all…', aftermath: 'Your thoughts are now a project.' },
        { text: 'Bumping this to the top again', busyText: 'Dealing with the bump…', aftermath: 'It got bumped. You got stuck.' }
      ],
      urgent: ESCALATIONS
    },
    lead: {
      trap: [
        { text: 'URGENT follow-up: still waiting on you!', busyText: 'Answering the loud follow-up…', aftermath: 'The follow-up was louder. It was not more important.' },
        { text: 'ASAP please, this is important!!', busyText: 'Doing the "important" thing…', aftermath: 'It was important to exactly one person.' },
        { text: 'Top priority!! Why no reply yet?', busyText: 'Replying to the top priority…', aftermath: 'Top priority, for about ten minutes.' }
      ],
      urgent: ESCALATIONS
    }
  };

  return { ROLES, ROLE_ORDER, LEVELS, LEVEL_ORDER, TELLS, SHARED_TRIVIAL, BUSY_TEXT, BOSSES, EVENTS, FOLLOW_UPS };
});
