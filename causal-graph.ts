import { Span, TraceDAGNode, CriticalPathStep } from './types.js';

export class CausalGraphBuilder {
  /**
   * Constructs an execution tree from a flat list of OpenTelemetry-style spans.
   */
  public static buildTraceTree(spans: Span[]): TraceDAGNode {
    if (spans.length === 0) {
      throw new Error('Cannot construct causal graph from empty span set');
    }

    const nodeMap = new Map<string, TraceDAGNode>();
    for (const span of spans) {
      nodeMap.set(span.spanId, {
        span,
        children: [],
        selfTimeMs: span.durationMs,
        totalTimeMs: span.durationMs,
        depth: 0
      });
    }

    let rootNode: TraceDAGNode | undefined;

    for (const span of spans) {
      const currentNode = nodeMap.get(span.spanId)!;
      if (span.parentSpanId && nodeMap.has(span.parentSpanId)) {
        const parentNode = nodeMap.get(span.parentSpanId)!;
        parentNode.children.push(currentNode);
      } else {
        rootNode = currentNode;
      }
    }

    if (!rootNode) {
      // Fallback: earliest span is root
      const sorted = [...spans].sort((a, b) => a.startTimeMs - b.startTimeMs);
      rootNode = nodeMap.get(sorted[0].spanId)!;
    }

    this.computeDepthsAndSelfTimes(rootNode, 0);
    return rootNode;
  }

  private static computeDepthsAndSelfTimes(node: TraceDAGNode, depth: number): void {
    node.depth = depth;
    let childrenSum = 0;
    for (const child of node.children) {
      this.computeDepthsAndSelfTimes(child, depth + 1);
      childrenSum += child.totalTimeMs;
    }
    // Self-time is total duration minus time spent waiting for synchronous children
    node.selfTimeMs = Math.max(0, node.totalTimeMs - childrenSum);
  }

  /**
   * Extracts the critical path (the longest sequential dependency chain dominating trace latency).
   */
  public static extractCriticalPath(root: TraceDAGNode): CriticalPathStep[] {
    const steps: CriticalPathStep[] = [];
    let current: TraceDAGNode | null = root;
    const totalTraceDuration = root.totalTimeMs;

    while (current) {
      steps.push({
        spanId: current.span.spanId,
        service: current.span.service,
        name: current.span.name,
        durationMs: current.totalTimeMs,
        selfTimeMs: current.selfTimeMs,
        percentageOfTrace: totalTraceDuration > 0
          ? Number(((current.totalTimeMs / totalTraceDuration) * 100).toFixed(1))
          : 0
      });

      // Find child with highest duration that fits within parent's active window
      if (current.children.length === 0) {
        current = null;
      } else {
        let maxChild: TraceDAGNode | null = null;
        for (const child of current.children) {
          if (!maxChild || child.totalTimeMs > maxChild.totalTimeMs) {
            maxChild = child;
          }
        }
        current = maxChild;
      }
    }

    return steps;
  }
}
