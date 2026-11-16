/**
 * SplitPaneTree — renders one split group's PaneAxis tree.
 *
 * A split node is a flex container in its direction — row for
 * 'vertical' (side by side), column for 'horizontal' (stacked) —
 * with its two children at the node's two sizes (flex-basis
 * percentages) and a SplitDivider between them. A leaf is one
 * pane: the caller renders the terminal for that tab id. The
 * tree nests, so a horizontal split inside a vertical one is a
 * stack inside a column, the way Atom's PaneAxis nests.
 *
 * Every box carries min-h-0 / min-w-0 so a nested flex child can
 * shrink below its content size — without them a deep tree
 * overflows instead of sharing the space. The Terminal fills its
 * wrapper (h-full w-full), so the leaf wrapper only needs its
 * flex basis.
 */
import type { ReactNode } from 'react';
import type { SplitGroup, SplitNode } from '../../stores/splitPaneStore';
import { SplitDivider } from './SplitDivider';

interface SplitPaneTreeProps {
  /** The group whose tree to render. */
  group: SplitGroup;
  /** Render one pane (a terminal) for a tab id. */
  renderPane: (tabId: string) => ReactNode;
}

export function SplitPaneTree({ group, renderPane }: SplitPaneTreeProps) {
  const renderNode = (node: SplitNode): ReactNode => {
    if (node.type === 'leaf') {
      return renderPane(node.tabId);
    }
    const horizontal = node.direction === 'horizontal';
    return (
      <div
        className={`flex flex-1 min-h-0 min-w-0 ${horizontal ? 'flex-col' : 'flex-row'}`}
      >
        <div
          className="min-h-0 min-w-0 flex"
          style={{ flex: `1 1 ${node.sizes[0]}%` }}
        >
          {renderNode(node.first)}
        </div>
        <SplitDivider groupId={group.id} nodeId={node.id} direction={node.direction} />
        <div
          className="min-h-0 min-w-0 flex"
          style={{ flex: `1 1 ${node.sizes[1]}%` }}
        >
          {renderNode(node.second)}
        </div>
      </div>
    );
  };

  return <>{renderNode(group.root)}</>;
}
