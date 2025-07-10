const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// uploads
if (!fs.existsSync('uploads')) {
	fs.mkdirSync('uploads');
}

// multer config
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const data = {
	espacios: [
		{ id: 1, codigo: "A1", estado: "libre" },
		{ id: 2, codigo: "A2", estado: "libre" },
		{ id: 3, codigo: "A3", estado: "libre" },
		{ id: 4, codigo: "A4", estado: "libre" },
		{ id: 5, codigo: "A5", estado: "libre" },
		{ id: 6, codigo: "B1", estado: "libre" },
		{ id: 7, codigo: "B2", estado: "libre" },
		{ id: 8, codigo: "B3", estado: "libre" },
		{ id: 9, codigo: "B4", estado: "libre" },
		{ id: 10, codigo: "B5", estado: "libre" }
	],
	reservas: [],
	reportes: [],
};

// Auto-increment IDs
let reservaId = 1;
let reporteId = 1;

app.get('/espacios', (req, res) => {
	res.json(data.espacios);
});

app.get('/historial', (req, res) => {
	res.json([...data.reservas].sort((a, b) =>
		(b.hora_entrada || '').localeCompare(a.hora_entrada || '') ||
		(b.hora_salida || '').localeCompare(a.hora_salida || '')
	));
});

app.post('/reservar', upload.single('foto'), (req, res) => {
	const { dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad } = req.body;
	const foto = req.file ? req.file.filename : null;

	const espacio = data.espacios.find(e => e.codigo === codigo_espacio);
	if (!espacio) return res.status(404).send('El espacio no existe');
	if (espacio.estado !== 'libre') return res.status(400).send(`El espacio está ${espacio.estado}`);

	const reservaActiva = data.reservas.find(r => r.dni === dni && !r.hora_salida);
	if (reservaActiva) return res.status(400).send('Ya tienes una reserva activa');

	data.reservas.push({
		id: reservaId++,
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
	res.send('Reserva realizada correctamente');
});

app.post('/ingresar', (req, res) => {
	const { codigo_espacio } = req.body;
	const now = new Date().toISOString();

	const reserva = data.reservas.find(r => r.codigo_espacio === codigo_espacio && !r.hora_entrada);
	if (reserva) reserva.hora_entrada = now;

	const espacio = data.espacios.find(e => e.codigo === codigo_espacio);
	if (espacio) espacio.estado = 'ocupado';

	res.send('Ingreso registrado');
});

app.post('/salir', (req, res) => {
	const { codigo_espacio } = req.body;
	const now = new Date().toISOString();

	const reserva = data.reservas.find(r => r.codigo_espacio === codigo_espacio && !r.hora_salida);
	if (reserva) reserva.hora_salida = now;

	const espacio = data.espacios.find(e => e.codigo === codigo_espacio);
	if (espacio) espacio.estado = 'libre';

	res.send('Salida registrada');
});

const reporteStorage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) => cb(null, 'reporte_' + Date.now() + path.extname(file.originalname))
});
const reporteUpload = multer({ storage: reporteStorage });

app.post('/reporte', reporteUpload.single('captura'), (req, res) => {
	const { nombre, dni, descripcion } = req.body;
	const captura = req.file ? req.file.filename : null;

	data.reportes.push({
		id: reporteId++,
		nombre,
		dni,
		descripcion,
		captura
	});

	res.send('✅ Reporte enviado correctamente');
});

app.use(express.static(path.join(__dirname, '../frontend')));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get("/reporte", (req, res) => res.sendFile(path.join(__dirname, '../frontend/reporte.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`http://localhost:${PORT}`);
});
