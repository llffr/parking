const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

// ¡IMPORTANTE! Cargar las variables de entorno AL INICIO
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de almacenamiento de fotos simuladas
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'backend/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Configuración de SQL Server usando variables de entorno
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

// Debug para verificar la configuración
console.log('=== CONFIGURACIÓN DE BASE DE DATOS ===');
console.log(config.user, config.database);
console.log('=====================================');

sql.connect(config, err => {
  if (err) {
    console.error('Error al conectar a SQL Server:', err);
    return;
  }
  console.log('✅ Conectado a SQL Server exitosamente');
});

// Obtener espacios
app.get('/espacios', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM espacios`;
    const espacios = result.recordset.map(e => ({
      ...e,
      codigo: String(e.codigo) // 👈 Esto fuerza que sea string
    }));
    res.json(espacios);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});


// Reservar espacio
app.post('/reservar', upload.single('foto'), async (req, res) => {
  const { dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad } = req.body;
  const foto = req.file ? req.file.filename : null;

  try {
    // Verificar estado del espacio
    const result = await sql.query`
      SELECT estado FROM espacios WHERE codigo = ${codigo_espacio}
    `;
    const estado = result.recordset[0]?.estado;

    if (!estado) {
      return res.status(404).send('El espacio no existe');
    }

    if (estado === 'reservado' || estado === 'ocupado') {
      return res.status(400).send(`El espacio está ${estado} y no puede ser reservado`);
    }

    // verifica si el usuario ya esta registrado
    const existeReserva = await sql.query` SELECT * FROM reservas WHERE dni = ${dni} AND hora_salida IS NULL `;
    if (existeReserva.recordset.length > 0) {
      return res.status(400).send('Ya tienes una reserva activa en otro espacio');
    }

    // Si está libre, proceder con la reserva
    await sql.query`
      INSERT INTO reservas (dni, placa, codigo_espacio, nombre_conductor, tarjeta_propiedad, foto)
      VALUES (${dni}, ${placa}, ${codigo_espacio}, ${nombre_conductor}, ${tarjeta_propiedad}, ${foto})
    `;
    await sql.query`
      UPDATE espacios SET estado = 'reservado' WHERE codigo = ${codigo_espacio}
    `;
    res.send('Reserva realizada correctamente');
  } catch (err) {
    console.error('Error al reservar:', err);
    res.status(500).send('Error en el servidor');
  }
});

// Marcar ingreso
app.post('/ingresar', async (req, res) => {
  const { codigo_espacio } = req.body;
  try {
    await sql.query`
      UPDATE reservas SET hora_entrada = GETDATE()
      WHERE codigo_espacio = ${codigo_espacio} AND hora_entrada IS NULL
    `;
    await sql.query`
      UPDATE espacios SET estado = 'ocupado' WHERE codigo = ${codigo_espacio}
    `;
    res.send('Ingreso registrado');
  } catch (err) {
    console.error('Error al ingresar:', err);
    res.status(500).send('Error en el servidor');
  }
});

// Marcar salida
app.post('/salir', async (req, res) => {
  const { codigo_espacio } = req.body;
  try {
    await sql.query`
      UPDATE reservas SET hora_salida = GETDATE()
      WHERE codigo_espacio = ${codigo_espacio} AND hora_salida IS NULL
    `;
    await sql.query`
      UPDATE espacios SET estado = 'libre' WHERE codigo = ${codigo_espacio}
    `;
    res.send('Salida registrada');
  } catch (err) {
    console.error('Error al salir:', err);
    res.status(500).send('Error en el servidor');
  }
});

// Historial de reservas
app.get('/historial', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM reservas ORDER BY hora_entrada DESC, hora_salida DESC`;
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ Error al obtener historial:', err);
    res.status(500).send('Error en el servidor');
  }
});

// reportes
const reporteStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'backend/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, 'reporte_' + Date.now() + path.extname(file.originalname));
  }
});
const reporteUpload = multer({ storage: reporteStorage });

app.post('/reporte', reporteUpload.single('captura'), async (req, res) => {
  const { nombre, dni, descripcion } = req.body;
  const captura = req.file ? req.file.filename : null;

  try {
    await sql.query`
      INSERT INTO reportes (nombre, dni, descripcion, captura)
      VALUES (${nombre}, ${dni || ''}, ${descripcion}, ${captura})
    `;
    res.send('✅ Reporte enviado correctamente');
  } catch (err) {
    console.error('Error al registrar reporte:', err);
    res.status(500).send('❌ Error al guardar el reporte');
  }
});

// 
app.use(express.static(path.join(__dirname, '../frontend')));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
app.get("/reporte", (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/reporte.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
