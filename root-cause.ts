import { Span, ServiceBaseline, RootCauseCandidate, TraceAnalysisReport } from './types.js';
import { CausalGraphBuilder } from './causal-graph.js';

export class RootCauseEngine {
  /**
   * Evaluates a trace against historical service p95 baselines to identify anomalies and pinpoint the primary culprit.
   */
  public static diagnoseTrace(
    spans: Span[],
    baselines: ServiceBaseline[]
  ): TraceAnalysisReport {
    if (spans.length === 0) {
      throw new Error('No spans to diagnose');
    }

    const baselineMap = new Map<string, ServiceBaseline>();
    for (const b of baselines) {
      baselineMap.set(`${b.service}::${b.operation}`, b);
    }

    const rootTree = CausalGraphBuilder.buildTraceTree(spans);
    const criticalPath = CausalGraphBuilder.extractCriticalPath(rootTree);
    const totalDuration = rootTree.totalTimeMs;

    const candidates: RootCauseCandidate[] = [];

    // Helper to find self-time from node map
    const nodeSelfTimes = new Map<string, number>();
    const collectSelfTimes = (node: typeof rootTree) => {
      nodeSelfTimes.set(node.span.spanId, node.selfTimeMs);
      node.children.forEach(collectSelfTimes);
    };
    collectSelfTimes(rootTree);

    for (const span of spans) {
      const key = `${span.service}::${span.name}`;
      const baseline = baselineMap.get(key);
      const isError = span.statusCode === 'ERROR';

      const p95 = baseline ? baseline.p95DurationMs : 100; // default 100ms
      const slowdownFactor = p95 > 0 ? span.durationMs / p95 : 1;
      const selfTime = nodeSelfTimes.get(span.spanId) ?? span.durationMs;
      const selfTimeRatio = totalDuration > 0 ? selfTime / totalDuration : 0;

      // An anomaly occurs if it errored or duration exceeded 1.5x p95
      if (isError || slowdownFactor > 1.5) {
        let blameScore = 0;
        if (isError) {
          blameScore += 40;
        }
        // Heavily weight self-time contribution and slowdown factor
        blameScore += Math.min(40, Math.round(selfTimeRatio * 40));
        blameScore += Math.min(20, Math.round(Math.min(slowdownFactor, 20)));

        let diagnosis = '';
        if (isError) {
          diagnosis = `Operation failed with error: "${span.errorMessage || 'Unknown Error'}". Directly impacts caller.`;
        } else {
          diagnosis = `Latency anomaly: executed in ${span.durationMs}ms (self-time: ${selfTime}ms, ${slowdownFactor.toFixed(1)}x over p95 of ${p95}ms).`;
        }

        candidates.push({
          spanId: span.spanId,
          service: span.service,
          operation: span.name,
          observedDurationMs: span.durationMs,
          baselineP95Ms: p95,
          relativeSlowdownFactor: Number(slowdownFactor.toFixed(2)),
          isError,
          errorMessage: span.errorMessage,
          blameScore: Math.min(100, blameScore),
          diagnosis
        });
      }
    }

    // Sort candidates by blame score descending
    candidates.sort((a, b) => b.blameScore - a.blameScore);

    let summary = '';
    if (candidates.length === 0) {
      summary = `Trace ${rootTree.span.traceId} is nominal. All ${spans.length} spans completed within baseline SLAs in ${totalDuration}ms.`;
    } else {
      const primary = candidates[0];
      summary = `Causal bottleneck detected: [${primary.service}] ${primary.operation} (Span: ${primary.spanId}). Blame score: ${primary.blameScore}/100. ${primary.diagnosis}`;
    }

    return {
      traceId: rootTree.span.traceId,
      rootSpan: rootTree.span,
      totalDurationMs: totalDuration,
      criticalPath,
      anomalies: candidates,
      summary
    };
  }
}
