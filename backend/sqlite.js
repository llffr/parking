const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// carpeta uploads
if (!fs.existsSync('uploads')) {
	fs.mkdirSync('uploads');
}

// config storage
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const db = new sqlite3.Database('./parking.db', (err) => {
	if (err) return console.error('❌ Error al conectar SQLite:', err.message);
	console.log('✅ Conectado a SQLite');
});

// tablas
db.serialize(() => {
	db.run(`
    create table if not exists espacios (
      id integer primary key autoincrement,
      codigo text unique,
	estado TEXT DEFAULT 'Libre'
    )
  `);

	db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dni TEXT,
      placa TEXT,
      codigo_espacio TEXT,
      nombre_conductor TEXT,
      tarjeta_propiedad TEXT,
      foto TEXT,
      hora_entrada TEXT,
      hora_salida TEXT
    )
  `);

	db.run(`
    CREATE TABLE IF NOT EXISTS reportes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      dni TEXT,
      descripcion TEXT,
      captura TEXT
    )
  `);
});

//
sql = `INSERT or ignore INTO espacios (codigo, estado) VALUES (?, ?)`;
const espacios = [
	["A1", "libre"],
	["A2", "libre"],
	["A3", "libre"],
	["A4", "libre"],
	["A5", "libre"],
	["B1", "libre"],
	["B2", "libre"],
	["B3", "libre"],
	["B4", "libre"],
	["B5", "libre"]
];

espacios.forEach(([codigo, estado]) => {
	db.run(sql, [codigo, estado], (err) => {
		if (err) console.error(`Error al insertar ${codigo}:`, err.message);
	});
});
//

// GET espacios
app.get('/espacios', (req, res) => {
	db.all('SELECT * FROM espacios', [], (err, rows) => {
		if (err) return res.status(500).send('Error al consultar espacios');
		const espacios = rows.map(e => ({ ...e, codigo: String(e.codigo) }));
		res.json(espacios);
	});
});

app.get('/historial', (req, res) => {
	db.all('SELECT dni, placa, nombre_conductor, tarjeta_propiedad, codigo_espacio, hora_entrada, hora_salida FROM reservas ORDER BY hora_entrada DESC, hora_salida DESC', [], (err, rows) => {
		if (err) return res.status(500).send('Error al obtener historial');
		res.json(rows);
	});
});


// POST reservar
app.post('/reservar', upload.single('foto'), (req, res) => {
	const { dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad } = req.body;
	const foto = req.file ? req.file.filename : null;

	db.get('SELECT estado FROM espacios WHERE codigo = ?', [codigo_espacio], (err, row) => {
		if (err) return res.status(500).send('Error al verificar espacio');

		if (!row) return res.status(404).send('El espacio no existe');

		if (row.estado === 'reservado' || row.estado === 'ocupado') {
			return res.status(400).send(`El espacio está ${row.estado}`);
		}

		db.get('SELECT * FROM reservas WHERE dni = ? AND hora_salida IS NULL', [dni], (err, existing) => {
			if (err) return res.status(500).send('Error al verificar reserva');

			if (existing) return res.status(400).send('Ya tienes una reserva activa');

			db.run(
				`INSERT INTO reservas (dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad, foto)
	 VALUES (?, ?, ?, ?, ?, ?)`,
				[dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad, foto],
				function(err) {
					if (err) return res.status(500).send('Error al reservar');

					db.run(`UPDATE espacios SET estado = 'reservado' WHERE codigo = ?`, [codigo_espacio]);
					res.send('Reserva realizada correctamente');
				}
			);
		});
	});
});

// POST ingresar
app.post('/ingresar', (req, res) => {
	const { codigo_espacio } = req.body;
	const now = new Date().toISOString();
	db.run(`
    UPDATE reservas SET hora_entrada = ?
    WHERE codigo_espacio = ? AND hora_entrada IS NULL
  `, [now, codigo_espacio]);

	db.run(`UPDATE espacios SET estado = 'ocupado' WHERE codigo = ?`, [codigo_espacio]);
	res.send('Ingreso registrado');
});

// POST salir
app.post('/salir', (req, res) => {
	const { codigo_espacio } = req.body;
	const now = new Date().toISOString();

	db.run(`
    UPDATE reservas SET hora_salida = ?
    WHERE codigo_espacio = ? AND hora_salida IS NULL
  `, [now, codigo_espacio]);

	db.run(`UPDATE espacios SET estado = 'libre' WHERE codigo = ?`, [codigo_espacio]);
	res.send('Salida registrada');
});

// reporte
const reporteStorage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, 'uploads/'),
	filename: (req, file, cb) => cb(null, 'reporte_' + Date.now() + path.extname(file.originalname))
});
const reporteUpload = multer({ storage: reporteStorage });

app.post('/reporte', reporteUpload.single('captura'), (req, res) => {
	const { nombre, dni, descripcion } = req.body;
	const captura = req.file ? req.file.filename : null;

	db.run(`
    INSERT INTO reportes (nombre, dni, descripcion, captura)
    VALUES (?, ?, ?, ?)`,
		[nombre, dni || '', descripcion, captura],
		err => {
			if (err) return res.status(500).send('❌ Error al guardar el reporte');
			res.send('✅ Reporte enviado correctamente');
		}
	);
});

// carga html
app.use(express.static(path.join(__dirname, '../frontend')));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get("/reporte", (req, res) => res.sendFile(path.join(__dirname, '../frontend/reporte.html')));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`http://localhost:${PORT}`);
});
