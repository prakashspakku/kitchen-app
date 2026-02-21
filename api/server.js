'use strict';
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const client    = require('prom-client');
 
const app = express();
const register = new client.Registry();
client.collectDefaultMetrics({ register });
 
// ── Prometheus metrics ───────────────────────────────────────────
const reqCounter = new client.Counter({
  name:'http_requests_total', help:'Total HTTP requests',
  labelNames:['method','route','status_code'], registers:[register]
});
const reqDuration = new client.Histogram({
  name:'http_request_duration_seconds', help:'Request duration in seconds',
  labelNames:['method','route'],
  buckets:[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5], registers:[register]
});
const orderCounter = new client.Counter({
  name:'kitchen_orders_created_total', help:'Total orders created',
  registers:[register]
});
const dbGauge = new client.Gauge({
  name:'mongodb_connection_status', help:'1=connected 0=disconnected',
  registers:[register]
});
 
app.use(cors()); app.use(express.json());
 
// ── Timing middleware ────────────────────────────────────────────
app.use((req,res,next)=>{
  const end=reqDuration.startTimer({method:req.method,route:req.path});
  res.on('finish',()=>{reqCounter.inc({method:req.method,route:req.path,status_code:res.statusCode});end();});
  next();
});
 
// ── MongoDB connection ───────────────────────────────────────────
const MONGO_URI=process.env.MONGO_URI||'mongodb://localhost:27017/kitchendb';
mongoose.connection.on('connected',()=>dbGauge.set(1));
mongoose.connection.on('disconnected',()=>dbGauge.set(0));
mongoose.connect(MONGO_URI,{serverSelectionTimeoutMS:5000})
  .catch(e=>{ console.warn('MongoDB not ready:',e.message); dbGauge.set(0); });
 
// ── Order model ──────────────────────────────────────────────────
const Order=mongoose.model('Order',new mongoose.Schema({
  dish:     {type:String,required:true,maxlength:200},
  status:   {type:String,enum:['pending','preparing','ready','done'],default:'pending'},
  timestamp:{type:Date,default:Date.now}
}));
 
// ── Routes ───────────────────────────────────────────────────────
app.get('/health',(req,res)=>{
  const state=mongoose.connection.readyState;
  const labels=['disconnected','connected','connecting','disconnecting'];
  res.status(state===1?200:503).json({
    status:state===1?'ok':'degraded', service:'kitchen-api',
    db:labels[state], uptime:Math.floor(process.uptime()),
    timestamp:new Date().toISOString(), node:process.version
  });
});
 
app.get('/ready',(req,res)=>
  mongoose.connection.readyState!==1
    ?res.status(503).json({ready:false,reason:'database not connected'})
    :res.json({ready:true}));
 
app.get('/orders',async(req,res)=>{
  try{res.json(await Order.find().sort({timestamp:-1}).limit(20).lean());}
  catch(e){res.status(500).json({error:e.message});}
});
 
app.post('/orders',async(req,res)=>{
  const{dish}=req.body;
  if(!dish||typeof dish!=='string'||!dish.trim()){
    return res.status(400).json({error:'dish is required and must be a non-empty string'});
  }
  try{
    const order=await new Order({dish:dish.trim()}).save();
    orderCounter.inc();
    res.status(201).json(order.toObject());
  }catch(e){res.status(500).json({error:e.message});}
});
 
app.get('/orders/:id',async(req,res)=>{
  try{
    const o=await Order.findById(req.params.id).lean();
    if(!o){ return res.status(404).json({error:'Order not found'}); }
    res.json(o);
  }catch(e){res.status(400).json({error:'Invalid order ID'});}
});
 
app.patch('/orders/:id/status',async(req,res)=>{
  const{status}=req.body;
  const valid=['pending','preparing','ready','done'];
  if(!valid.includes(status)){
    return res.status(400).json({error:`status must be one of: ${valid.join(', ')}`});
  }
  try{
    const o=await Order.findByIdAndUpdate(req.params.id,{status},{new:true}).lean();
    if(!o){ return res.status(404).json({error:'Order not found'}); }
    res.json(o);
  }catch(e){res.status(400).json({error:'Update failed'});}
});
 
app.get('/metrics',async(req,res)=>{
  res.set('Content-Type',register.contentType);
  res.end(await register.metrics());
});
app.get('/', (req, res) => { res.json({ message: 'Kitchen API is running!', endpoints: ['/health', '/ready', '/orders', '/metrics'] }); });
 
app.use((req,res)=>res.status(404).json({error:`Route ${req.method} ${req.path} not found`}));
 
const PORT=parseInt(process.env.PORT,10)||3000;
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`Kitchen API running on :${PORT}`));
process.on('SIGTERM',()=>server.close(()=>mongoose.connection.close(false,()=>process.exit(0))));
module.exports={app,server};
