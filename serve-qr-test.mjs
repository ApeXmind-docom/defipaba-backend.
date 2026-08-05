process.env.ANTHROPIC_API_KEY = "sk-fake";
process.env.WHATSAPP_LINE_1_NAME = "Mauricio";
process.env.WHATSAPP_LINE_1_NUMBER = "573136439020";
process.env.WHATSAPP_LINE_2_NAME = "Daniel";
process.env.WHATSAPP_LINE_2_NUMBER = "573003615111";
process.env.PANEL_PASSWORD = "prueba123";
process.env.DB_PATH = "/tmp/qr-test/paba.db";
process.env.PORT = "4488";

const { startServer } = await import("/home/claude/paba/dist/server/index.js");
const { setLineConnected, setLineQr } = await import("/home/claude/paba/dist/whatsapp/status.js");

setLineConnected("573136439020", true);   // Mauricio: conectado
// Daniel: desconectado, con un QR de prueba pendiente
const QRCode = (await import("qrcode")).default;
const dataUrl = await QRCode.toDataURL("prueba-fake-qr-string-daniel", { margin: 1, scale: 6 });
setLineQr("573003615111", dataUrl);

startServer();
console.log("QR generado, longitud:", dataUrl.length);
