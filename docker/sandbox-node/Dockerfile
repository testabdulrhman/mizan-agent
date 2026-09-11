# صورة الحاوية المعزولة لتشغيل كود المستخدم (Node.js).
# لا تحتوي على أي أسرار ولا وصول للشبكة عند التشغيل (--network=none).
FROM node:20-alpine

# node:20-alpine يحتوي مستخدماً غير جذر باسم node وبرقم 1000.
RUN mkdir -p /workspace && chown -R node:node /workspace

USER node
WORKDIR /workspace

# لا CMD افتراضي مفيد: الأمر يُمرَّر من lib/sandbox.ts بعد التحقق منه.
CMD ["node", "--version"]
