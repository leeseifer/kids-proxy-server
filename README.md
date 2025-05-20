# Kid‑Coupon Proxy 🕹️🕑

Meter each child’s Internet time with printable "minute" vouchers. A Raspberry Pi, Squid proxy, and a tiny Node.js API work together to cut the Wi‑Fi when the clock hits **00:00**.

---

## 1. Features

| Category         | Highlights                                           |
| ---------------- | ---------------------------------------------------- |
| **Time Control** | Per‑kid balance (pause / resume)                     |
| **Vouchers**     | 6‑char codes for **15 / 30 / 45 / 60 min**           |
| **Bulk PDF**     | A4 sheets, 24 coupons per page (PDFKit)              |
| **Proxy Modes**  | 3128 forward‑proxy (auth) • 3129 transparent capture |
| **Admin UI**     | Create single code, bulk PDF, change passwords       |
| **Self‑Healing** | systemd service auto‑restarts Node API               |

---

## 2. High‑Level Diagram
![image](https://github.com/user-attachments/assets/74304010-3cad-4c99-b794-a51f1dd5b94a)

---

## 3. Quick Start (Raspberry Pi OS / Debian 12)

```bash
# 3‑1  Packages
sudo apt update
sudo apt install squid nodejs npm sqlite3 apache2-utils git -y

# 3‑2  Clone project
cd /opt && sudo git clone https://github.com/<you>/kids-proxy-server.git coupon
sudo chown -R $USER:$USER coupon && cd coupon

# 3‑3  Node deps & DB
npm install                          # pdfkit, bcryptjs, express, better-sqlite3
sqlite3 coupons.db < db.sql          # tables & seed data

```

---

## 4. Squid Configuration

1. **Copy helper & set perms**

   ```bash
   sudo cp configurationFiles/coupon_acl /etc/squid/
   sudo chmod 750 /etc/squid/coupon_acl
   sudo chown proxy:proxy /etc/squid/coupon_acl
   ```

2. \`\`\*\* /etc/squid/squid.conf (snippets)t\*\*

   ```conf
   http_port 3128                 # forward‑proxy (auth)
   http_port 3129 intercept       # transparent capture

   auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
   auth_param basic realm CouponProxy
   acl kids_users proxy_auth REQUIRED

   external_acl_type coupon_check ttl=1 %LOGIN /etc/squid/coupon_acl
   acl kids_coupon external coupon_check

   # allow voucher UI even at zero balance
   acl voucher_srv dst 192.168.127.42
   acl voucher_port port 8080
   http_access allow voucher_srv voucher_port

   http_access allow kids_users kids_coupon
   http_access deny  all
   ```

3. **Create passwd file**

   ```bash
   sudo htpasswd -c /etc/squid/passwd nguyen
   sudo htpasswd    /etc/squid/passwd han
   sudo systemctl restart squid
   ```

---

## 5. NAT Redirect (optional)

If you want every device captured transparently:

```bash
ETH=eth0
sudo iptables -t nat -A PREROUTING -i $ETH -p tcp --dport 80  -j REDIRECT --to-ports 3129
sudo iptables -t nat -A PREROUTING -i $ETH -p tcp --dport 443 -j REDIRECT --to-ports 3129
```

Install **iptables‑persistent** or nftables rules to survive reboot.

---

## 6. Node API as a Service

`/etc/systemd/system/coupon-api.service`:

```ini
[Unit]
Description=Coupon API (Node.js)
After=network.target

[Service]
WorkingDirectory=/opt/coupon
ExecStart=/usr/bin/node /opt/coupon/server.js
Restart=on-failure
RestartSec=3
User=pi
Group=pi
#Environment=PORT=8080   # if you use process.env.PORT

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now coupon-api
```

Browse to [**http://192.168.127.42:8080/**](http://192.168.127.42:8080/).

---

## 7. Using the Web UIs

| Path          | Audience | Function                                    |
| ------------- | -------- | ------------------------------------------- |
| `/`           | Kids     | Login, live countdown, Redeem, Start, Pause |
| `/admin.html` | Parents  | Single code, **Bulk PDF**, password change  |

**Bulk PDF** example (downloads `vouchers.pdf`):

```bash
curl -X POST http://192.168.127.42:8080/admin/printVouchers \
 -H "Content-Type: application/json" \
 -d '{"adminPass":"secret","user":"nguyen","minutes":15,"count":48}' \
 --output vouchers.pdf
```

---

## 8. Common Tasks

### Change a Kid’s Password

```bash
# Squid side
sudo htpasswd /etc/squid/passwd nguyen
# DB side
node tools/setPass.js nguyen NEWPASS
```

### Top‑up 15 minutes manually

```bash
sqlite3 coupons.db "UPDATE users SET remaining_seconds = remaining_seconds + 900 WHERE username='nguyen';"
```

---

## 9. Troubleshooting

| Symptom                                | Resolution                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `Permission denied /coupon_acl`        | Ensure helper path `/etc/squid/coupon_acl`, mode 750, owner `proxy:proxy`. |
| `SqliteError: no such column`          | Run latest migration in `migrations/`.                                     |
| `systemd status coupon-api = 217/USER` | Correct `User=` and `Group=` fields or chown project files.                |
| Kids can’t reach voucher page          | Verify ACL order: voucher allow **before** coupon ACL.                     |

---

## 10. Licence

MIT

Pull requests welcome—QR‑code vouchers, parental Slack alerts, or a React front‑end are all fair game!
