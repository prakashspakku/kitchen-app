// Runs once on first container start via /docker-entrypoint-initdb.d/
db = db.getSiblingDB('kitchendb');
 
// Create collection with schema validation
db.createCollection('orders', {
  validator: { $jsonSchema: {
    bsonType: 'object', required: ['dish'],
    properties: { dish: { bsonType: 'string', maxLength: 200 } }
  }}
});
 
// Create indexes for query performance
db.orders.createIndex({ timestamp: -1 });
db.orders.createIndex({ status: 1, timestamp: -1 });
 
// Seed data so students see content on first load
db.orders.insertMany([
  { dish: 'Masala Dosa',     status: 'done',      timestamp: new Date() },
  { dish: 'Idli Sambar',     status: 'ready',     timestamp: new Date() },
  { dish: 'Chicken Biryani', status: 'preparing', timestamp: new Date() },
  { dish: 'Vada Pav',        status: 'pending',   timestamp: new Date() },
]);
 
print('kitchendb ready with seed data and indexes');
