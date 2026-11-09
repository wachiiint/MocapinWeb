# Dev Rule

A rule to obey for development this project <span style="color:red">(PLEASE READ)</span>

## Ground rule
1. มี toplevel แทรกเป็น .md หรือ .txt ทุกครั้งที่ทำ feature มา \
 คนทำต้องอธิบายได้ ขอแบบ slop screening แล้ว \
 ได้โปรดเขียนเป็น ภาษามนุส แบบมี personality, uniqueness \
 เรามาลด debt ไปด้วยกัน
2. ถ้าอันไหนกอป AI มาทั้งดุ้น flag ด้วย พยายามอย่าให้ยาวมาก สักไม่เกิน 50 % ของที่พิมพ์ สงสารคนอ่านเด้อ
3. ฉันจะสร้าง repo ใหม่(อันนี้แหละ) และใส่ CI/CD ฉันเมิจเอง \
 ห้ามให้ เไ คอมมิทให้นะจ๊ะ ได้โปรดพิมพ์ message เอง \
 เมิจเอง รีเบสเอง มาลองผิดลองถูกไปพร้อมกัน
4. ถ้าหากมีอัพเดท หรือข้อสงสัย ติดต่อ Wachi ได้ 24/7 จะได้ช่วยดูด้วยกัน ไม่ต้องเกรงใจ
5. ถ้าหากมีไฟล์อื่น ๆ ที่ใช้ทด หรือเติม Context ให้เไ ให้เอาใส่ไว้ใน `./temp` อ่านเองคนเดียว
6. Anti-Slop tag: ส่วนที่เราเขียน (โค้ดใส่ใน comment, doc ใส่ตรง ๆ) แปะ `[Anti-Slop: 60% - @owner - note]` \
 % = เรารีวิว/มั่นใจส่วนนั้นแค่ไหน ใส่ตรงไหน ระดับเท่าไหร่ ใช้วิจารณญาณเอง \
 ใครแก้ส่วนที่มี tag ต้องอัพเดท tag ด้วย \
 เไ ห้ามใส่ % เอง ทำได้แค่เตือนให้เจ้าของใส่

## Responsible
1. Wachi  - PM, architecture design
2. Dobby  - UX/UI, frontend + Computer Vision Engineer
3. GAn    - Camera & Calibration Engineer
4. Duckin - Backend Senior
5. Imtaez - Tester??


## Task
As of 24/10/2026
- Wachi: 
        จะลองคิดดู Architecture โดยรวมใหม่อีกนิด (again) \
        กำหนดภาพรวม ทำ CI/CD ด้วย มั้ง

- Dobby: ทำมาสักพัก คงจะเข้าใจโมเดลโดยรวม \
        ดูโมเดลด้านหน้าของ pipeline ให้หน่อย \
        ขอทำความเข้าใจ Spec อย่างละเอียดถาม RTMpose ต้องตอบได้ \
        Layer, input, output ? \
        Dimension, meaning ? \
        พยายามยัดความรู้เรื่อง Inverse Kinematic มาได้ไหม ดูแล้วน่าจะเกี่ยว มีประโยชน์แหละคิดว่่า \
        การคลีนดาต้าด้วย เท่าที่อ่านคือใช้ butterworth filter กรอง signal ได้  \ 
        กับ triangulation แทน slop lifting by motionBERT \
        ไม่รู้เหมือนกัน ไม่ไหวเรียกได้ พร้อมช่วย ยากจัด \
- GAn: เห็นทำ Calibrate มาช่ำ น่าจะรู้ know how พอสมควร
        ฝากดูเรื่อง calibrate หน่อย \
        คือตอนนี้พวกฉัน (Dobby + Wachi) เคยคุยว่า อาจจะลอง 2 โหมด \
        30% กล้องตัวเดียว 70% กล้อง 2++ ตัว พอจะทราบไหมว่า calibrate มันทำยังไงวะ \
        กุไม่รู้ว่าใช้ chess board มัน practical ไหม (ไม่น่า) \
        ถ้าเป็นไปได้ ลองคิดหน่อยว่า มีกล้องหลายตัว จะ Calib ยังไงให้มัน sync ใน dimension/space เดียวกัน \
- Duckin: รีวิว paper มาแล้ว \
        มาทำ opensim กับ Wachi \
        task จะคล้ายๆ กับ ไอภูข้างบน  \
        คือทำความเข้าใจ spec, layer, หลักการของโมเดล \
        มันทำอะไร ใช้ยังไงวะ \
        กับออกแบบ Application layer (สามารถ savage มาจาก app เก่าไอภูได้) ที่ใช้แสดงผล