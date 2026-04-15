const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const cors = require('cors');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.static('public'));

// Sanitize filename
const sanitize = (str) => str.replace(/[<>:"/\\|?*]/g, '').trim().slice(0, 100);

// Configuración de las cookies desde las variables de entorno de Railway
const requestOptions = {
  headers: {
    cookie: process.env.YOUTUBE_COOKIES || ''
  }
};

// GET /api/info?url=...
app.get('/api/info', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });

    // Se agregan las cookies a la petición de información
    const info = await ytdl.getInfo(url, { requestOptions });
    const details = info.videoDetails;

    res.json({
      title: details.title,
      channel: details.author.name,
      duration: parseInt(details.lengthSeconds),
      thumbnail: details.thumbnails.slice(-1)[0]?.url || '',
    });
  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: 'No se pudo obtener información del video. Verifica el enlace o las cookies.' });
  }
});

// GET /api/download?url=...&format=mp3&quality=192
app.get('/api/download', async (req, res) => {
  try {
    const { url, format = 'mp3', quality = '192' } = req.query;
    if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });

    // Se agregan las cookies también aquí para obtener los metadatos necesarios para descargar
    const info = await ytdl.getInfo(url, { requestOptions });
    const title = sanitize(info.videoDetails.title);

    const mimeTypes = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', opus: 'audio/opus' };
    const mime = mimeTypes[format] || 'audio/mpeg';

    res.setHeader('Content-Disposition', `attachment; filename="${title}.${format}"`);
    res.setHeader('Content-Type', mime);

    // Se agregan las cookies al stream de audio
    const audioStream = ytdl(url, {
      quality: 'highestaudio',
      filter: 'audioonly',
      requestOptions // <--- Esto aplica las cookies de Railway
    });

    ffmpeg(audioStream)
      .audioBitrate(parseInt(quality))
      .format(format)
      .on('error', (err) => {
        console.error('FFmpeg error:', err.message);
        if (!res.headersSent) res.status(500).end('Error al convertir el audio');
      })
      .pipe(res, { end: true });

  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo descargar el audio.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ SoundDrop corriendo en el puerto ${PORT} con soporte de Cookies`);
});
