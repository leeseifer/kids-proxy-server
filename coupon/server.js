const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const express = require('express');
const path    = require('path');
const db      = require('better-sqlite3')('./coupons.db');
const app     = express();  app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

/* ─────────  Core helpers  ───────── */

function tick(u){                       // burn seconds for a running user
  if(u.state!=='running') return u;
  const now = Date.now()/1000, delta = now - (u.last_tick||now);
  u.remaining_seconds -= delta;         // count DOWN
  u.last_tick = now;
  if(u.remaining_seconds <= 0){
    u.remaining_seconds = 0;
    u.state = 'finished';
  }
  db.prepare(`UPDATE users SET remaining_seconds=?,state=?,last_tick=? WHERE username=?`)
    .run(u.remaining_seconds,u.state,u.last_tick,u.username);
  return u;
}

/* ─────────  Squid helper  ───────── */

app.get('/check',(req,res)=>{
 const u = db.prepare('SELECT * FROM users WHERE username=?')
               .get(req.query.user); 
 if(!u){ return res.send('ERR'); }
  const r = tick(u);
  res.send(r.remaining_seconds>0 && r.state==='running' ? 'OK':'ERR');
});

/* ─────────  Kid pages  ───────── */

/* POST /start  {user, pass, voucher?}  : login + optional redeem */
app.post('/start', (req,res)=>{
  const {user,  voucher} = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(user);
  

  // optional: redeem a voucher at start-time
  if(voucher){
    const v = db.prepare('SELECT * FROM vouchers WHERE code=?').get(voucher);
    if(!v || v.used || v.username!==user) return res.status(400).send('bad-voucher');
    db.prepare('UPDATE users SET remaining_seconds = remaining_seconds + ? WHERE username=?')
      .run(v.minutes*60,user);
    db.prepare('UPDATE vouchers SET used=1 WHERE code=?').run(voucher);
  }

  db.prepare(`UPDATE users SET state='running', last_tick=? WHERE username=?`)
    .run(Date.now()/1000,user);
  res.send('started');
});

app.post('/pause',(req,res)=>{
  const {user} = req.body;
  db.prepare(`UPDATE users SET state='paused' WHERE username=?`).run(user);
  res.send('paused');
});

/* ─────────  Admin section  ───────── */

/* POST /admin/newVoucher  {adminPass, user, minutes}  */
const ADMIN_PASS = process.env.ADMIN_PASS || 'letmein';
app.post('/admin/newVoucher',(req,res)=>{
  const {adminPass, user, minutes} = req.body;
  if(adminPass!==ADMIN_PASS) return res.status(401).send('nope');
  if(![15,30,45,60].includes(minutes)) return res.status(400).send('bad mins');
  const code = crypto.randomBytes(3).toString('base64url');   // 6 chars
  db.prepare('INSERT INTO vouchers(code,minutes,username) VALUES (?,?,?)')
    .run(code, minutes, user);
  res.json({code});
});

// server.js  (place near other REST routes)
app.get('/balance', (req,res)=>{
  const {user} = req.query;
  const u = db.prepare('SELECT remaining_seconds,state FROM users WHERE username=?').get(user);
  if(!u) return res.status(404).end();
  res.json({seconds: Math.max(0, u.remaining_seconds), state: u.state});
});


app.post('/admin/setPassword', (req,res) => {
  const {adminPass, user, newPass} = req.body;
  if(adminPass !== ADMIN_PASS) return res.status(401).send('nope');
  const hash = bcrypt.hashSync(newPass, 10);
  db.prepare('UPDATE users SET passhash=? WHERE username=?').run(hash, user);
  // sync Squid passwd file too (requires write perms):
  require('child_process')
    .execSync(`sudo htpasswd -b /etc/squid/passwd ${user} ${newPass}`);
  res.send('updated');
});

const PDF = require('pdfkit');
app.post('/admin/printVouchers',(req,res)=>{
  const {adminPass,user,minutes,count}=req.body;
  if(adminPass!==ADMIN_PASS) return res.status(401).end();
  const doc=new PDF({size:'A4',margin:36});      // 36pt = 0.5"
  res.setHeader('Content-Type','application/pdf');
  doc.pipe(res);

  const perRow=3, perCol=8, w=170, h=65;         // 24 coupons per page
  let x=0,y=0,printed=0;

  while(printed<count){
    const code=crypto.randomBytes(3).toString('base64url');
    db.prepare('INSERT INTO vouchers(code,minutes,username) VALUES (?,?,?)')
      .run(code, minutes, user);

    doc.rect(36+x*w, 36+y*h, w-10, h-10).stroke();
    doc.fontSize(14).text(`Voucher: ${code}`, 46+x*w, 46+y*h);
    doc.fontSize(10).text(`${minutes} minutes – user: ${user}`,
                          46+x*w, 66+y*h);

    if(++x===perRow){ x=0; if(++y===perCol){ y=0; doc.addPage(); } }
    printed++;
  }
  doc.end();
});



const PORT = 8080;
app.listen(PORT, () => console.log(`Coupon API on ${PORT}`));

