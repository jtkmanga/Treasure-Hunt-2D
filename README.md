# Treasure Hunt 2D 🗺️

เกมล่าสมบัติ 2D สำหรับเล่นบนมือถือ พัฒนาแยกจาก GPT-VOXEL-3D โดยมีเป้าหมายให้แข่งขันสะสมคะแนนออนไลน์ **โดยไม่ต้องมี WebSocket เปิดค้างตลอดเวลา** ในอนาคต

> **สถานะ: ต้นแบบออฟไลน์ (V1) — ยังไม่ใช่เกมออนไลน์จริง**  
> ระบบร้านค้า, VIP, คะแนนอันดับ และ Lucky Box ใน V1 เป็นข้อมูลจำลองเฉพาะเครื่อง ไม่ใช้เงินจริง ไม่เชื่อม Slip2Go, Firebase หรือระบบคะแนนเดิม

## เล่นต้นแบบ

เปิดไฟล์ [index.html](./index.html) ผ่านเว็บเซิร์ฟเวอร์ Static หรือดาวน์โหลดแล้วเปิดในเบราว์เซอร์ที่รองรับ HTML5 Canvas และ Pointer Events

- กด **เริ่มด่าน** เพื่อเล่นรอบละ 3 นาที
- ใช้จอยเสมือนบนมือถือ หรือปุ่ม **WASD/ลูกศร** บนคีย์บอร์ดเพื่อเดิน
- เข้าใกล้เหรียญ/หีบแล้วกด **เก็บ** หรือ Space
- เลือกแผนที่ได้ 3 แบบ: ป่า, ถ้ำ, วิหาร
- มีเหรียญ 82 เหรียญต่อด่าน (ทดลอง) เกิดใหม่หลังเก็บ 1 นาที
- มีหีบ Lucky Box จำลอง 1 ใบ คูลดาวน์ 4 ชั่วโมงเฉพาะรอบที่กำลังเล่น
- หน้าอันดับ ร้านค้า และราคา VIP เป็นหน้าจอตัวอย่างเท่านั้น

## ทดสอบ

ไฟล์เกมไม่จำเป็นต้องติดตั้งแพ็กเกจอื่น หากต้องการตรวจสอบโค้ดด้วย Node.js ให้รัน:

```sh
npm test
```

GitHub Actions จะตรวจ Smoke Test อัตโนมัติเมื่อมีการแก้ไขเกมหรือไฟล์ทดสอบ ระบบนี้เป็นการตรวจโค้ดและสถานะจำลอง ไม่ใช่ผลทดสอบผู้เล่นออนไลน์จริง

## หลักการพัฒนาต่อ

โครงสร้างใหม่ตั้งใจใช้ HTML5/Canvas สำหรับเล่นเกมในมือถือ, Cloudflare Workers HTTP API สำหรับตรวจยืนยันผลด่าน และฐานข้อมูลเก็บคะแนน/สิทธิ์ ไม่ส่งการเดินผ่าน WebSocket ทุกเฟรม

ต้องทดสอบโควตา Free Tier จากจำนวน API/วันและรายการฐานข้อมูลจริง **ไม่รับประกัน 0 บาทเมื่อมีผู้เล่น 1,000 คนออนไลน์ตลอด 24 ชั่วโมง**

แผนละเอียด: [docs/ROADMAP.md](docs/ROADMAP.md)

## ความปลอดภัย

อย่าส่ง Firebase private key, Slip2Go secret, Cloudflare token หรือข้อมูลบัญชีผู้เล่นลง Repository นี้ เพราะเป็น Public การนำระบบชำระเงินเดิมกลับมาใช้ต้องใช้ Backend ปลอดภัยและผ่านการทดสอบใน Staging ก่อน ไม่คัดลอก Secret จากโครงการเก่า


## เปิดเล่นผ่าน Cloudflare Pages (ยังต้องอัปโหลดหนึ่งครั้ง)

สร้าง Pages Direct Upload project ชื่อ **treasure-hunt-2d-jtk** ในบัญชี Cloudflare แล้ว แต่ในขณะเขียนเอกสารนี้ **ยังไม่มี deployment** เพราะ Cloudflare API ปฏิเสธการเชื่อมต่อ GitHub และการอัปโหลด asset ด้วยสิทธิ์ที่มี

1. ไปที่แท็บ **Actions** ของ Repository นี้ แล้วเปิด workflow **Cloudflare Pages upload ZIP (offline prototype)** ที่ผ่านผลทดสอบ
2. ดาวน์โหลด Artifact ชื่อ **treasure-hunt-2d-pages-upload** (GitHub จะให้ไฟล์ ZIP ซึ่งภายในมี `index.html` ที่ root)
3. เปิด [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) เลือกโปรเจกต์ `treasure-hunt-2d-jtk` แล้วกด **Create a new deployment**
4. เลือก **Production** → เลือกไฟล์ ZIP จากมือถือ → **Save and Deploy**
5. เมื่อ Cloudflare แสดงว่า Deploy สำเร็จ เปิด https://treasure-hunt-2d-jtk.pages.dev/ เพื่อทดสอบบนมือถือ

วิธีนี้เป็นการอัปโหลด Static HTML ไม่มี WebSocket, ไม่มี Pages Functions, ไม่มีระบบซื้อเงินจริงและไม่ต้องใช้ Cloudflare API Token ใด ๆ ใน GitHub

**หมายเหตุ:** Pages Direct Upload ไม่สามารถเปลี่ยนเป็น Git Integration ภายหลังได้ ถ้าต้องการ GitHub Auto Deploy ให้สร้าง Pages project ใหม่หลังแก้ไขสิทธิ์ GitHub integration (อย่าคัดลอก token ลง Repository นี้)

## ที่มาของต้นแบบ

คัดลอกและแยกพัฒนาจากเกมต้นแบบใน Branch `feature/treasure-hunt-2d-prototype-20261028` ของ Repository `jtkmanga/GPT-VOXEL-3D` (Draft PR #47) เมื่อ 28 ต.ค. 2026 โดยไม่แก้หรือ Deploy เกม 3D เดิม
