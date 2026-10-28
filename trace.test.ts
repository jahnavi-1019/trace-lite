import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Span, ServiceBaseline } from './types.js';
import { CausalGraphBuilder } from './causal-graph.js';
import { RootCauseEngine } from './root-cause.js';

test('TraceLite CausalGraph: builds parent-child tree and calculates self-time', () => {
  const spans: Span[] = [
    {
      traceId: 'tr-001',
      spanId: 'root',
      name: 'GET /checkout',
      service: 'api-gateway',
      startTimeMs: 1000,
      durationMs: 300,
      statusCode: 'OK'
    },
    {
      traceId: 'tr-001',
      spanId: 'auth',
      parentSpanId: 'root',
      name: 'POST /auth/verify',
      service: 'auth-service',
      startTimeMs: 1010,
      durationMs: 40,
      statusCode: 'OK'
    },
    {
      traceId: 'tr-001',
      spanId: 'pay',
      parentSpanId: 'root',
      name: 'POST /charge',
      service: 'payment-service',
      startTimeMs: 1060,
      durationMs: 200,
      statusCode: 'OK'
    }
  ];

  const tree = CausalGraphBuilder.buildTraceTree(spans);
  assert.equal(tree.span.spanId, 'root');
  assert.equal(tree.children.length, 2);
  // Total children duration = 40 + 200 = 240. Self-time of root = 300 - 240 = 60ms.
  assert.equal(tree.selfTimeMs, 60);

  const criticalPath = CausalGraphBuilder.extractCriticalPath(tree);
  assert.equal(criticalPath.length, 2);
  assert.equal(criticalPath[0].spanId, 'root');
  assert.equal(criticalPath[1].spanId, 'pay');
});

test('TraceLite RootCause: detects latency spike and localizes primary bottleneck', () => {
  const spans: Span[] = [
    {
      traceId: 'tr-002',
      spanId: 'root',
      name: 'POST /orders',
      service: 'order-api',
      startTimeMs: 2000,
      durationMs: 950,
      statusCode: 'OK'
    },
    {
      traceId: 'tr-002',
      spanId: 'db-query',
      parentSpanId: 'root',
      name: 'SELECT orders',
      service: 'postgres',
      startTimeMs: 2050,
      durationMs: 850, // Massive latency spike!
      statusCode: 'OK'
    }
  ];

  const baselines: ServiceBaseline[] = [
    {
      service: 'order-api',
      operation: 'POST /orders',
      p50DurationMs: 120,
      p95DurationMs: 200,
      p99DurationMs: 300
    },
    {
      service: 'postgres',
      operation: 'SELECT orders',
      p50DurationMs: 15,
      p95DurationMs: 30, // 850ms vs 30ms baseline
      p99DurationMs: 50
    }
  ];

  const report = RootCauseEngine.diagnoseTrace(spans, baselines);
  assert.equal(report.anomalies.length, 2);
  assert.equal(report.anomalies[0].service, 'postgres');
  assert.equal(report.anomalies[0].operation, 'SELECT orders');
  assert.ok(report.anomalies[0].relativeSlowdownFactor > 20);
  assert.ok(report.anomalies[0].blameScore >= 50);
});

test('TraceLite RootCause: identifies failed spans as high-priority culprits', () => {
  const spans: Span[] = [
    {
      traceId: 'tr-003',
      spanId: 'root',
      name: 'GET /user',
      service: 'web',
      startTimeMs: 3000,
      durationMs: 80,
      statusCode: 'ERROR',
      errorMessage: 'Upstream payment failed'
    },
    {
      traceId: 'tr-003',
      spanId: 'sub',
      parentSpanId: 'root',
      name: 'GET /account',
      service: 'account-service',
      startTimeMs: 3010,
      durationMs: 60,
      statusCode: 'ERROR',
      errorMessage: 'Database connection timeout'
    }
  ];

  const report = RootCauseEngine.diagnoseTrace(spans, []);
  assert.ok(report.anomalies.length >= 1);
  assert.ok(report.anomalies.some(a => a.isError));
});
