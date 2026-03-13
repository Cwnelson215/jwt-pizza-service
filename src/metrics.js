const os = require('os');
const config = require('./config.js');

class Metrics {
  constructor() {
    this.httpRequests = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
    this.activeUsers = 0;
    this.authAttempts = { successful: 0, failed: 0 };
    this.pizzaMetrics = { sold: 0, failed: 0, revenue: 0 };
    this.latency = { total: 0, count: 0 };
    this.pizzaLatency = { total: 0, count: 0 };

    this.requestTracker = this.requestTracker.bind(this);

    const interval = 10000;
    this.timer = setInterval(() => this.sendMetrics(), interval);
    this.timer.unref();
  }

  requestTracker(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (this.httpRequests[req.method] !== undefined) {
        this.httpRequests[req.method]++;
      }
      this.latency.total += duration;
      this.latency.count++;
    });
    next();
  }

  authAttempt(success) {
    if (success) {
      this.authAttempts.successful++;
    } else {
      this.authAttempts.failed++;
    }
  }

  activeUserChange(delta) {
    this.activeUsers += delta;
    if (this.activeUsers < 0) this.activeUsers = 0;
  }

  pizzaPurchase(success, latency, price) {
    if (success) {
      this.pizzaMetrics.sold++;
      this.pizzaMetrics.revenue += price;
    } else {
      this.pizzaMetrics.failed++;
    }
    this.pizzaLatency.total += latency;
    this.pizzaLatency.count++;
  }

  getCpuUsage() {
    const load = os.loadavg();
    return load[0];
  }

  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    return ((total - free) / total) * 100;
  }

  nowNanos() {
    return `${Date.now()}000000`;
  }

  makeGauge(name, unit, value, attributes = {}) {
    return {
      name,
      unit,
      gauge: {
        dataPoints: [
          {
            asDouble: value,
            timeUnixNano: this.nowNanos(),
            attributes: this.makeAttributes(attributes),
          },
        ],
      },
    };
  }

  makeSum(name, unit, value, attributes = {}) {
    return {
      name,
      unit,
      sum: {
        dataPoints: [
          {
            asDouble: value,
            timeUnixNano: this.nowNanos(),
            attributes: this.makeAttributes(attributes),
          },
        ],
        aggregationTemporality: 2, // CUMULATIVE
        isMonotonic: true,
      },
    };
  }

  makeAttributes(obj) {
    const attrs = [{ key: 'source', value: { stringValue: config.metrics.source } }];
    for (const [key, val] of Object.entries(obj)) {
      attrs.push({ key, value: { stringValue: String(val) } });
    }
    return attrs;
  }

  buildOtlpPayload() {
    const prefix = 'pizza_service';
    const metrics = [];

    // HTTP requests by method
    for (const [method, count] of Object.entries(this.httpRequests)) {
      metrics.push(this.makeSum(`${prefix}_http_requests_total`, '', count, { method }));
    }

    // Total HTTP requests
    const totalRequests = Object.values(this.httpRequests).reduce((sum, c) => sum + c, 0);
    metrics.push(this.makeSum(`${prefix}_http_requests_all_total`, '', totalRequests));

    // Active users
    metrics.push(this.makeGauge(`${prefix}_active_users`, '', this.activeUsers));

    // Auth attempts
    metrics.push(this.makeSum(`${prefix}_auth_attempts_total`, '', this.authAttempts.successful, { status: 'successful' }));
    metrics.push(this.makeSum(`${prefix}_auth_attempts_total`, '', this.authAttempts.failed, { status: 'failed' }));

    // CPU and memory
    metrics.push(this.makeGauge(`${prefix}_cpu_load`, '', this.getCpuUsage()));
    metrics.push(this.makeGauge(`${prefix}_memory_usage_percent`, 'percent', this.getMemoryUsage()));

    // Pizza metrics
    metrics.push(this.makeSum(`${prefix}_pizzas_sold_total`, '', this.pizzaMetrics.sold));
    metrics.push(this.makeSum(`${prefix}_pizza_creation_failures_total`, '', this.pizzaMetrics.failed));
    metrics.push(this.makeSum(`${prefix}_revenue_total`, '', this.pizzaMetrics.revenue));

    // Latency
    const avgLatency = this.latency.count > 0 ? this.latency.total / this.latency.count : 0;
    metrics.push(this.makeGauge(`${prefix}_endpoint_latency_avg`, 'milliseconds', avgLatency));

    const avgPizzaLatency = this.pizzaLatency.count > 0 ? this.pizzaLatency.total / this.pizzaLatency.count : 0;
    metrics.push(this.makeGauge(`${prefix}_pizza_factory_latency_avg`, 'milliseconds', avgPizzaLatency));

    return {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics,
            },
          ],
        },
      ],
    };
  }

  async sendMetrics() {
    const { endpointUrl, accountId, apiKey } = config.metrics;
    if (!endpointUrl || !accountId || !apiKey) {
      return;
    }

    const payload = this.buildOtlpPayload();

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accountId}:${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        console.error(`Failed to push metrics: ${response.status}`);
      }
    } catch (error) {
      console.error('Error pushing metrics:', error.cause || error.message);
    }
  }
}

const metrics = new Metrics();
module.exports = metrics;
