// pm2: modo remoto en el VPS.  pm2 start ecosystem.config.cjs && pm2 save
// exec_mode 'fork' es obligatorio: en modo cluster el servidor no arranca a escuchar.
module.exports = {
  apps: [
    {
      name: 'mcp-api-colombia',
      script: 'src/http.js',
      exec_mode: 'fork',
      node_args: '--env-file=.env',
      max_memory_restart: '200M',
      autorestart: true,
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
