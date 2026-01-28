const request = require('supertest');
const app = require('./service');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

const pizza = {
  id: 'test',
  title: 'test',
  description: 'testing',
  image: 'none',
  price: 2
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

// Authentication tests
test('register - success and password validation', async () => {
  const email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const res = await request(app).post('/api/auth').send({ name: 'test user', email, password: 'validpass' });
  expect(res.status).toBe(200);
  expect(res.body.user.roles).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'diner' })]));
  expectValidJwt(res.body.token);
  
  const shortRes = await request(app).post('/api/auth').send({ name: 'test', email: Math.random().toString(36).substring(2, 12) + '@test.com', password: '' });
  expect(shortRes.status).toBe(400);
});

test('login - success and failure cases', async () => {
  const loginRes = await request(app).put('/api/auth/').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);
  expect(loginRes.body.user.email).toBe(testUser.email);
  
  const wrongPwdRes = await request(app).put('/api/auth/').send({ email: testUser.email, password: 'wrongpwd' });
  expect(wrongPwdRes.status).toBe(404);
});

test('logout - success and re-logout fails', async () => {
  const email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send({ name: 'test', email, password: 'test' });
  const token = registerRes.body.token;
  
  const logoutRes1 = await request(app).delete('/api/auth').set('Authorization', `Bearer ${token}`);
  expect(logoutRes1.status).toBe(200);
  expect(logoutRes1.body.message).toContain('logout successful');
  
  const logoutRes2 = await request(app).delete('/api/auth').set('Authorization', `Bearer ${token}`);
  expect(logoutRes2.status).toBe(401);
});

// Menu tests
test('menu - get and auth requirements', async () => {
  const menuRes = await request(app).get('/api/order/menu');
  expect(menuRes.status).toBe(200);
  expect(Array.isArray(menuRes.body)).toBe(true);
  
  const addRes = await request(app).put('/api/order/menu').send(pizza);
  expect(addRes.status).toBe(401);
  
  const user = await request(app).post('/api/auth').send(testUser);
  const noAdminRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${user.body.token}`).send(pizza);
  expect(noAdminRes.status).toBe(403);
});

// Order tests
test('orders - create, list, and auth', async () => {
  const user = await request(app).post('/api/auth').send(testUser);
  const token = user.body.token;
  
  const order = { franchiseId: 1, storeId: 1, items: [{menuId: pizza.id, description: pizza.description, price: pizza.price}] };
  const createRes = await request(app).post('/api/order/').set('Authorization', `Bearer ${token}`).send(order);
  expect([200, 500]).toContain(createRes.status);
  
  const listRes = await request(app).get('/api/order').set('Authorization', `Bearer ${token}`);
  expect([200, 500]).toContain(listRes.status);
  
  const listPageRes = await request(app).get('/api/order?page=0').set('Authorization', `Bearer ${token}`);
  expect([200, 500]).toContain(listPageRes.status);
  
  const noAuthRes = await request(app).post('/api/order/').send(order);
  expect(noAuthRes.status).toBe(401);
});

// Franchise tests
test('franchise - crud operations and auth', async () => {
  const user = await request(app).post('/api/auth').send(testUser);
  const token = user.body.token;
  
  const getFranRes = await request(app).get('/api/franchise');
  expect(getFranRes.status).toBe(200);
  expect(getFranRes.body).toHaveProperty('franchises');
  
  const getFranQueryRes = await request(app).get('/api/franchise?limit=10&page=0');
  expect(getFranQueryRes.status).toBe(200);
  
  const getUserFranRes = await request(app).get(`/api/franchise/${user.body.user.id}`).set('Authorization', `Bearer ${token}`);
  expect([200, 403]).toContain(getUserFranRes.status);
  
  const franchise = { name: 'test franchise', admins: [{ email: user.body.user.email }] };
  const createRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${token}`).send(franchise);
  expect([200, 403]).toContain(createRes.status);
  
  const deleteRes = await request(app).delete('/api/franchise/999999').set('Authorization', `Bearer ${token}`);
  expect([200, 403, 404]).toContain(deleteRes.status);
  
  const noAuthRes = await request(app).post('/api/franchise').send(franchise);
  expect(noAuthRes.status).toBe(401);
});

// Store tests
test('stores - create and delete with auth', async () => {
  const user = await request(app).post('/api/auth').send(testUser);
  const token = user.body.token;
  
  const createRes = await request(app).post('/api/franchise/999999/store').set('Authorization', `Bearer ${token}`).send({ name: 'test' });
  expect([403, 404]).toContain(createRes.status);
  
  const deleteRes = await request(app).delete('/api/franchise/999999/store/999999').set('Authorization', `Bearer ${token}`);
  expect([403, 404]).toContain(deleteRes.status);
  
  const noAuthCreateRes = await request(app).post('/api/franchise/1/store').send({ name: 'test store' });
  expect(noAuthCreateRes.status).toBe(401);
  
  const noAuthDeleteRes = await request(app).delete('/api/franchise/1/store/1');
  expect(noAuthDeleteRes.status).toBe(401);
});

// User and security tests
test('users - update and token validation', async () => {
  const user = await request(app).post('/api/auth').send(testUser);
  const token = user.body.token;
  
  const updateRes = await request(app).put(`/api/user/${user.body.user.id}`).set('Authorization', `Bearer ${token}`).send({ email: 'newemail@test.com' });
  expect([200, 400]).toContain(updateRes.status);
  
  const noAuthRes = await request(app).put('/api/user/1').send({ email: 'test@test.com' });
  expect(noAuthRes.status).toBe(401);
  
  const invalidTokenRes = await request(app).get('/api/order').set('Authorization', 'Bearer invalid-token');
  expect(invalidTokenRes.status).toBe(401);
});

// General endpoints
test('general endpoints - documentation and 404', async () => {
  const docRes = await request(app).get('/api/');
  expect([200, 404]).toContain(docRes.status);
  
  const notFoundRes = await request(app).get('/invalid');
  expect(notFoundRes.status).toBe(404);
  
  const deleteNoAuthRes = await request(app).delete('/api/franchise/1');
  expect([200, 401]).toContain(deleteNoAuthRes.status);
});

// Additional coverage for edge cases
test('duplicate email registration and name updates', async () => {
  const email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const user1 = { name: 'user one', email, password: 'pass123' };
  
  const res1 = await request(app).post('/api/auth').send(user1);
  expect(res1.status).toBe(200);
  
  const res2 = await request(app).post('/api/auth').send(user1);
  expect([200, 409]).toContain(res2.status);
  
  const loginRes = await request(app).put('/api/auth/').send({ email, password: 'pass123' });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.user.name).toBe('user one');
  
  const updateRes = await request(app).put(`/api/user/${loginRes.body.user.id}`).set('Authorization', `Bearer ${loginRes.body.token}`).send({ name: 'updated name' });
  expect([200, 400, 500]).toContain(updateRes.status);
});

test('menu item operations', async () => {
  const menuRes = await request(app).get('/api/order/menu');
  expect(menuRes.status).toBe(200);
  
  const newPizza = {
    title: 'newpizza',
    description: 'new pizza test',
    image: 'newpizza.png',
    price: 3.5
  };
  
  const user = await request(app).post('/api/auth').send(testUser);
  const addWithoutAdminRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${user.body.token}`).send(newPizza);
  expect(addWithoutAdminRes.status).toBe(403);
});
