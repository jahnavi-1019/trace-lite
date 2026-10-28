export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTimeMs: number;
  durationMs: number;
  statusCode: 'OK' | 'ERROR';
  attributes?: Record<string, string | number | boolean>;
  errorMessage?: string;
}

export interface TraceDAGNode {
  span: Span;
  children: TraceDAGNode[];
  selfTimeMs: number;
  totalTimeMs: number;
  depth: number;
}

export interface CriticalPathStep {
  spanId: string;
  service: string;
  name: string;
  durationMs: number;
  selfTimeMs: number;
  percentageOfTrace: number;
}

export interface ServiceBaseline {
  service: string;
  operation: string;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
}

export interface RootCauseCandidate {
  spanId: string;
  service: string;
  operation: string;
  observedDurationMs: number;
  baselineP95Ms: number;
  relativeSlowdownFactor: number;
  isError: boolean;
  errorMessage?: string;
  blameScore: number; // 0 to 100
  diagnosis: string;
}

export interface TraceAnalysisReport {
  traceId: string;
  rootSpan: Span;
  totalDurationMs: number;
  criticalPath: CriticalPathStep[];
  anomalies: RootCauseCandidate[];
  summary: string;
}
