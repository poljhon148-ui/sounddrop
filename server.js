const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const cors = require('cors');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.static('public'));

// Limpiar el nombre del archivo para evitar errores
const sanitize = (str) => str.replace(/[<>:"/\\|?*]/g, '').trim().slice(0, 100);

// CONFIGURACIÓN MAESTRA DE CABECERAS
// Esto hace que YouTube crea que la petición viene de un Chrome real
const requestOptions = {
  headers: {
    'cookie': process.env.YOUTUBE_COOKIES || '',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'es-ES,es;q=0.9',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'referer': 'https://www.youtube.com/',
    'x-youtube-client-name': '1',
    'x-youtube-client-version': '2.20240501.01.00'
  }
};

// GET /api/info?url=...
app.get('/api/info', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });

    // Intentamos obtener info con las cookies y el User-Agent
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
    res.status(500).json({ 
      error: 'Error de acceso a YouTube. Verifica que tus cookies en Railway sigan vigentes.' 
    });
  }
});

// GET /api/download?url=...&format=mp3&quality=192
app.get('/api/download', async (req, res) => {
  try {
    const { url, format = 'mp3', quality = '192' } = req.query;
    if (!url) return res.status(400).json({ error: 'Falta el parámetro url' });

    const info = await ytdl.getInfo(url, { requestOptions });
    const title = sanitize(info.videoDetails.title);

    const mimeTypes = { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', opus: 'audio/opus' };
    const mime = mimeTypes[format] || 'audio/mpeg';

    res.setHeader('Content-Disposition', `attachment; filename="${title}.${format}"`);
    res.setHeader('Content-Type', mime);

    // Aplicar las cookies también al flujo de descarga
    const audioStream = ytdl(url, {
      quality: 'highestaudio',
      filter: 'audioonly',
      requestOptions 
    });

    ffmpeg(audioStream)
      .audioBitrate(parseInt(quality))
      .format(format)
      .on('error', (err) => {
        console.error('FFmpeg error:', err.message);
        if (!res.headers_sent) res.status(500).end('Error al convertir el audio');
      })
      .pipe(res, { end: true });

  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'YouTube bloqueó la descarga. Intenta actualizar tus cookies.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ SoundDrop Activo en puerto ${PORT}`);
});
