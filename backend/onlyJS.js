const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// json file 
const DB_FILE = './db.json';

// carpeta uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Cargar base de datos desde archivo JSON o crear una
let data;
if (fs.existsSync(DB_FILE)) {
	data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
} else {
	data = { espacios: [], reservas: [], reportes: [] };
}

// save json
function guardarDatos() {
	fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Inicializar espacios si no existen
if (data.espacios.length === 0) {
	const codigos = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'];
	data.espacios = codigos.map((codigo, i) => ({
		id: i + 1,
		codigo,
		estado: 'libre'
	}));
	guardarDatos();
}

// Config multer
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const reporteStorage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) => cb(null, 'reporte_' + Date.now() + path.extname(file.originalname))
});
const reporteUpload = multer({ storage: reporteStorage });

// Obtener espacios
app.get('/espacios', (req, res) => {
	res.json(data.espacios);
});

// Historial de reservas
app.get('/historial', (req, res) => {
	res.json([...data.reservas].sort((a, b) =>
		(b.hora_entrada || '').localeCompare(a.hora_entrada || '') ||
		(b.hora_salida || '').localeCompare(a.hora_salida || '')
	));
});

// Reservar espacio
app.post('/reservar', upload.single('foto'), (req, res) => {
	const { dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad } = req.body;
	const foto = req.file ? req.file.filename : null;

	const espacio = data.espacios.find(e => e.codigo === codigo_espacio);
	if (!espacio) return res.status(404).send('El espacio no existe');
	if (espacio.estado !== 'libre') return res.status(400).send(`El espacio está ${espacio.estado}`);

	const reservaActiva = data.reservas.find(r => r.dni === dni && !r.hora_salida);
	if (reservaActiva) return res.status(400).send('Ya tienes una reserva activa');

	data.reservas.push({
		id: Date.now(),
		dni,
		placa,
		codigo_espacio,
		nombre_conductor,
		tarjeta_propiedad,
		foto,
		hora_entrada: null,
		hora_salida: null
	});

	espacio.estado = 'reservado';
	guardarDatos();
	res.send('Reserva realizada correctamente');
});

// Ingresar a espacio
app.post('/ingresar', (req, res) => {
	const { codigo_espacio } = req.body;
	const now = new Date().toISOString();

	const reserva = data.reservas.find(r => r.codigo_espacio === codigo_espacio && !r.hora_entrada);
	if (reserva) reserva.hora_entrada = now;

	const espacio = data.espacios.find(e => e.codigo === codigo_espacio);
	if (espacio) espacio.estado = 'ocupado';

	guardarDatos();
	res.send('Ingreso registrado');
});

// Salir de espacio
app.post('/salir', (req, res) => {
	const { codigo_espacio } = req.body;
	const now = new Date().toISOString();

	const reserva = data.reservas.find(r => r.codigo_espacio === codigo_espacio && !r.hora_salida);
	if (reserva) reserva.hora_salida = now;

	const espacio = data.espacios.find(e => e.codigo === codigo_espacio);
	if (espacio) espacio.estado = 'libre';

	guardarDatos();
	res.send('Salida registrada');
});

// Enviar reporte
app.post('/reporte', reporteUpload.single('captura'), (req, res) => {
	const { nombre, dni, descripcion } = req.body;
	const captura = req.file ? req.file.filename : null;

	data.reportes.push({
		id: Date.now(),
		nombre,
		dni,
		descripcion,
		captura
	});

	guardarDatos();
	res.send('✅ Reporte enviado correctamente');
});

app.use(express.static(path.join(__dirname, '../frontend')));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get("/reporte", (req, res) => res.sendFile(path.join(__dirname, '../frontend/reporte.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`http://localhost:${PORT}`);
});
