const config = require('./config.js');

class Logger {
  httpLogger = (req, res, next) => {
    const originalSend = res.send;
    let responseBody;

    res.send = (body) => {
      responseBody = body;
      return originalSend.call(res, body);
    };

    res.on('finish', () => {
      const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        hasAuth: !!req.headers.authorization,
        reqBody: this.sanitize(req.body),
        resBody: this.sanitize(this.tryParseJson(responseBody)),
      };
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      this.sendLogToGrafana(level, 'http', logData);
    });

    next();
  };

  dbLogger(query) {
    this.sendLogToGrafana('info', 'db', { query });
  }

  factoryLogger(reqBody, resBody, statusCode) {
    const logData = {
      reqBody: this.sanitize(reqBody),
      resBody: this.sanitize(resBody),
      statusCode,
    };
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.sendLogToGrafana(level, 'factory', logData);
  }

  logException(message, statusCode, stack) {
    this.sendLogToGrafana('error', 'exception', { message, statusCode, stack });
  }

  log(level, type, logData) {
    this.sendLogToGrafana(level, type, logData);
  }

  sanitize(data) {
    if (!data) return data;
    if (typeof data === 'string') {
      return data.replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '****');
    }
    if (typeof data !== 'object') return data;

    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (['password', 'token', 'authorization', 'apikey', 'api_key'].includes(lowerKey)) {
        sanitized[key] = '****';
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitize(sanitized[key]);
      } else if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitized[key].replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '****');
      }
    }
    return sanitized;
  }

  tryParseJson(value) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  sendLogToGrafana(level, type, logData) {
    if (!config.logging) return;
    const { source, endpointUrl, accountId, apiKey } = config.logging;
    if (!endpointUrl || !accountId || !apiKey) return;

    const labels = { component: source, level, type };
    const values = [[`${Date.now()}000000`, JSON.stringify(logData)]];
    const body = JSON.stringify({ streams: [{ stream: labels, values }] });

    fetch(endpointUrl, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountId}:${apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.error('Failed to send log to Grafana');
    }).catch((err) => {
      console.error('Error sending log to Grafana:', err.message);
    });
  }
}

const logger = new Logger();
module.exports = logger;
