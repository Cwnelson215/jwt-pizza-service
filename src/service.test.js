const request = require('supertest');
const app = require('./service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('register - password too short should fail', async () => {
  const res = await request(app).post('/api/auth').send({
    name: 'test user',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: ''
  });
  expect(res.status).toBe(400);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth/').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

test('logout', async () => {
  const logoutTestUser = {
    name: 'logout tester',
    email: Math.random().toString(36).substring(2, 12) + '@test.com',
    password: 'logout123',
  };
  const registerRes = await request(app).post('/api/auth').send(logoutTestUser);
  const logoutToken = registerRes.body.token;


  const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${logoutToken}`);
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toContain('logout successful');
});

// test('create a franchise', async () => {
//   const franchisee = {
//     name: 'admin franchiser',
//     email: Math.random().toString(36).substring(2, 12) + '@test.com',
//     password: 'admin123',
//     roles: [{role: 'franchisee'}]
//   };

//   const franRegisterRes = await request(app).post('api/auth').send(franchisee);
//   const franLoginRes =  await request(app).put('api/auth/').send({
//     email: franchisee.email,
//     password: franchisee.password
//   });

//   const franToken = franLoginRes.body.token;

//   const franchiseRequest = {
//     name:'Pizza Palace',
//     admins:
//   }

// });
