/**
 * Demo widgets barrel — the one import for the synth view and for
 * widget authors. Importing this module registers the native widgets
 * (the compass) and the custom widgets in customWidgets.ts.
 */

import { registerBuiltInSynthWidget } from '../../../lib/synthWidgets';
import { COMPASS_WIDGET } from './CompassWidget';
import './customWidgets';
import { WidgetLayer } from './WidgetLayer';
import { CompassWidget, COMPASS_WIDGET_ID } from './CompassWidget';
import { SeedWidget, SEED_WIDGET } from './SeedWidget';

export {
  WidgetLayer,
  CompassWidget,
  COMPASS_WIDGET,
  COMPASS_WIDGET_ID,
  SeedWidget,
  SEED_WIDGET,
};
export {
  getSynthWidget,
  hasSynthWidget,
  listSynthWidgets,
  registerBuiltInSynthWidget,
  registerSynthWidget,
  unregisterSynthWidget,
  widgetsGateMet,
} from '../../../lib/synthWidgets';
export type {
  SynthWidgetContext,
  SynthWidgetDefinition,
} from '../../../lib/synthWidgets';

// Native widgets register once, when the barrel loads. Re-imports
// are no-ops (the registry ignores the same definition twice).
registerBuiltInSynthWidget(COMPASS_WIDGET);
