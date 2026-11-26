const http = require('http');
const app = require('../api/index');
const { User, DecoyBlog, PrivateChat, Message } = require('../models');

async function runTests() {
  console.log('====================================================');
  console.log('   SafeBlog Backend Phase 2 Verification Test Suite ');
  console.log('====================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const fetchJson = async (path, options = {}) => {
    const { headers = {}, ...restOptions } = options;
    const res = await fetch(`${baseUrl}${path}`, {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  // 1. Health check
  console.log('[Test 1] Health Check...');
  const health = await fetchJson('/api/health');
  if (health.status !== 200 || health.data.status !== 'healthy') {
    throw new Error('Health check failed');
  }
  console.log('✓ Health check passed (DB connected:', health.data.databaseConnected, ')\n');

  // Generate unique test users
  const timestamp = Date.now();
  const userAData = {
    email: `alice_${timestamp}@safeblog.test`,
    username: `alice_${timestamp}`,
    displayName: 'Alice Decoy Writer',
    bio: 'Writing reflective thoughts daily.',
    blogPin: '1234',
    safePin: '9999',
  };

  const userBData = {
    email: `bob_${timestamp}@safeblog.test`,
    username: `bob_${timestamp}`,
    displayName: 'Bob Private User',
    bio: 'Secret communications only.',
    blogPin: '4321',
    safePin: '8888',
  };

  // 2. Registration & PIN Validation
  console.log('[Test 2] Registration & PIN Conflict Validation...');
  // Same PIN rejection test
  const invalidReg = await fetchJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ ...userAData, safePin: '1234' }),
  });
  if (invalidReg.status !== 400) {
    throw new Error('Failed to reject identical Blog PIN and Safe PIN');
  }
  console.log('✓ Correctly rejected identical Blog PIN and Safe PIN');

  // Register User A
  const regA = await fetchJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(userAData),
  });
  if (regA.status !== 201 || !regA.data.token) {
    throw new Error(`User A registration failed: ${JSON.stringify(regA.data)}`);
  }
  const userA = regA.data.user;
  console.log('✓ User A registered successfully:', userA.username);

  // Register User B
  const regB = await fetchJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(userBData),
  });
  if (regB.status !== 201) {
    throw new Error('User B registration failed');
  }
  const userB = regB.data.user;
  console.log('✓ User B registered successfully:', userB.username, '\n');

  // 3. Dual-PIN Lock Screen Gatekeeper
  console.log('[Test 3] Dual-PIN Gatekeeper Routing...');
  // Entering Blog PIN (1234) -> Decoy Mode
  const blogPinLogin = await fetchJson('/api/auth/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ identifier: userA.username, pin: '1234' }),
  });
  if (blogPinLogin.status !== 200 || blogPinLogin.data.mode !== 'DECOY') {
    throw new Error('Blog PIN did not route to DECOY mode');
  }
  const decoyTokenA = blogPinLogin.data.token;
  console.log('✓ Entering Blog PIN (1234) routes to DECOY mode (Decoy Safe Blog)');

  // Entering Safe PIN (9999) -> Secret Mode with 1.5s animation timing
  const safePinLogin = await fetchJson('/api/auth/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ identifier: userA.username, pin: '9999' }),
  });
  if (
    safePinLogin.status !== 200 ||
    safePinLogin.data.mode !== 'SECRET' ||
    safePinLogin.data.syncAnimationDurationMs !== 1500
  ) {
    throw new Error('Safe PIN did not route to SECRET mode with 1.5s sync animation');
  }
  const secretTokenA = safePinLogin.data.token;
  console.log('✓ Entering Safe PIN (9999) routes to SECRET mode (Private Chat) with 1.5s fake sync');

  // Entering Invalid PIN (0000) -> 401 Unauthorized
  const invalidPinLogin = await fetchJson('/api/auth/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ identifier: userA.username, pin: '0000' }),
  });
  if (invalidPinLogin.status !== 401) {
    throw new Error('Invalid PIN was not rejected');
  }
  console.log('✓ Invalid PIN (0000) was rejected with 401 Unauthorized\n');

  // Get User B secret token for chat testing
  const safePinLoginB = await fetchJson('/api/auth/verify-pin', {
    method: 'POST',
    body: JSON.stringify({ identifier: userB.username, pin: '8888' }),
  });
  const secretTokenB = safePinLoginB.data.token;

  // 4. Strict Mode Isolation (PRD Section 3 & 5)
  console.log('[Test 4] Strict Mode Isolation & Gatekeeper Security...');
  const unauthorizedSecretAccess = await fetchJson('/api/chat/conversations', {
    headers: { Authorization: `Bearer ${decoyTokenA}` },
  });
  if (unauthorizedSecretAccess.status !== 403) {
    throw new Error('Decoy token was able to access Secret Chat endpoint!');
  }
  console.log('✓ Access to Private Chat strictly denied (403) when using Decoy Mode token');

  const authorizedSecretAccess = await fetchJson('/api/chat/conversations', {
    headers: { Authorization: `Bearer ${secretTokenA}` },
  });
  if (authorizedSecretAccess.status !== 200) {
    throw new Error('Secret token was rejected from Secret Chat endpoint');
  }
  console.log('✓ Access to Private Chat allowed (200) when using Secret Mode token\n');

  // 5. Decoy Blog Features (Screenshots 1 - 10)
  console.log('[Test 5] Decoy Blog Features (Screenshots 1-10)...');
  // Today Tab
  const todayData = await fetchJson('/api/blogs/today', {
    headers: { Authorization: `Bearer ${decoyTokenA}` },
  });
  if (todayData.status !== 200 || !todayData.data.today.dailyPrompt.text) {
    throw new Error('Failed to fetch Today tab data');
  }
  console.log('✓ GET /api/blogs/today returned daily prompt:', todayData.data.today.dailyPrompt.text);

  // Create published blog entry
  const createBlogRes = await fetchJson('/api/blogs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${decoyTokenA}` },
    body: JSON.stringify({
      title: 'Shipped v1 after 3 weeks of late nights',
      content:
        'Deleted half the features I originally planned and focused only on making the core loop feel snappy. Best decision I made this month.',
      mood: 'Happy',
      isPublic: true,
      isDraft: false,
    }),
  });
  if (createBlogRes.status !== 201) {
    throw new Error(`Failed to create blog entry: ${createBlogRes.status} ${JSON.stringify(createBlogRes.data)}`);
  }
  const createdBlog = createBlogRes.data.entry;
  console.log('✓ Published blog entry created:', createdBlog.title, `(${createdBlog.readTimeMinutes} min read)`);

  // Explore feed
  const exploreFeed = await fetchJson('/api/blogs/explore?mood=Happy');
  if (exploreFeed.status !== 200 || exploreFeed.data.data.length === 0) {
    throw new Error('Failed to fetch Explore feed filtered by Happy');
  }
  console.log(`✓ Explore feed returned ${exploreFeed.data.data.length} stories filtered by mood: Happy`);

  // Profile data
  const profileRes = await fetchJson(`/api/blogs/profile?userId=${userA.id}`, {
    headers: { Authorization: `Bearer ${decoyTokenA}` },
  });
  if (profileRes.status !== 200 || profileRes.data.profile.username !== userA.username) {
    throw new Error('Failed to fetch user profile');
  }
  console.log('✓ Profile tab loaded successfully for @' + profileRes.data.profile.username, '\n');

  // 6. Private Chat & Real-Time Engine (Screenshots 11 - 14)
  console.log('[Test 6] Private Chat & Stealth Messaging (Screenshots 11-14)...');
  // User discovery
  const searchRes = await fetchJson(`/api/chat/users/search?q=${userB.username}`, {
    headers: { Authorization: `Bearer ${secretTokenA}` },
  });
  if (searchRes.status !== 200 || searchRes.data.users.length === 0) {
    throw new Error('User discovery failed to find User B');
  }
  console.log('✓ User discovery found target user:', searchRes.data.users[0].username);

  // Start conversation
  const convRes = await fetchJson('/api/chat/conversations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretTokenA}` },
    body: JSON.stringify({ recipientId: userB.id }),
  });
  if (convRes.status !== 200) {
    throw new Error('Failed to create conversation');
  }
  const chatId = convRes.data.conversation._id;
  console.log('✓ 1-on-1 Private conversation established (Chat ID:', chatId, ')');

  // Send message from User A to User B
  const sendRes = await fetchJson('/api/chat/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretTokenA}` },
    body: JSON.stringify({
      chatId,
      text: 'Good evening sir g, apna number share kar dijiye.',
    }),
  });
  if (sendRes.status !== 201) {
    throw new Error('Failed to send message');
  }
  const sentMessage = sendRes.data.message;
  console.log('✓ Message sent from User A:', sentMessage.text);

  // Send reply from User B with reply quote
  const replyRes = await fetchJson('/api/chat/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretTokenB}` },
    body: JSON.stringify({
      chatId,
      text: '7827405083',
      replyTo: sentMessage._id,
    }),
  });
  if (replyRes.status !== 201) {
    throw new Error('Failed to send reply');
  }
  const replyMessage = replyRes.data.message;
  console.log('✓ Reply message sent from User B with quote reference:', replyMessage.text);

  // Add emoji reaction (❤️)
  const reactRes = await fetchJson(`/api/chat/messages/${sentMessage._id}/react`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretTokenB}` },
    body: JSON.stringify({ emoji: '❤️' }),
  });
  if (reactRes.status !== 200 || reactRes.data.reactions.length === 0) {
    throw new Error('Failed to add emoji reaction');
  }
  console.log('✓ Added heart reaction (❤️) to message');

  // Mark as read
  const readRes = await fetchJson('/api/chat/messages/read', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${secretTokenB}` },
    body: JSON.stringify({ chatId }),
  });
  if (readRes.status !== 200) {
    throw new Error('Failed to mark messages as read');
  }
  console.log('✓ Marked messages as read (Double ticks trigger)');

  // Ghost notification polling (Flutter workmanager background check)
  const pollRes = await fetchJson('/api/chat/poll', {
    headers: { Authorization: `Bearer ${secretTokenA}` },
  });
  if (pollRes.status !== 200 || !pollRes.data.disguisedNotification) {
    throw new Error('Ghost notification polling failed');
  }
  console.log('✓ Ghost notification polling returned disguised prompt:', pollRes.data.disguisedNotification.body);

  // 7. SSE Real-Time Stream Handshake
  console.log('\n[Test 7] SSE Real-Time Stream Handshake...');
  await new Promise((resolve, reject) => {
    const sseReq = http.request(
      `${baseUrl}/api/chat/stream?token=${secretTokenA}&chatId=${chatId}`,
      { headers: { Accept: 'text/event-stream' } },
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          if (buffer.includes('event: connected')) {
            console.log('✓ SSE Stream connection handshake verified successfully');
            sseReq.destroy();
            resolve();
          }
        });
      }
    );
    sseReq.on('error', reject);
    sseReq.end();
  });

  server.close(() => {
    console.log('\n====================================================');
    console.log('   All Phase 2 Backend Verification Tests PASSED!   ');
    console.log('====================================================');
    process.exit(0);
  });
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
