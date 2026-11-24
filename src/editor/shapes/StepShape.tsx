import { Circle, Group, Text as KonvaText } from 'react-konva';
import { contrastTextColor } from '@/src/annotations/color';
import { readStepStyle } from '@/src/annotations/step/stepStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface StepShapeProps extends CommonShapeProps {
  object: EditorObject;
}

/** A filled numbered badge. x/y/width/height is its bounding box; it always renders as a circle. */
export function StepShape({ object, ...common }: StepShapeProps) {
  const style = readStepStyle(object.style);
  const size = Math.max(8, Math.min(Math.abs(object.width), Math.abs(object.height)));
  const label = String(style.number);
  return (
    <Group {...common} width={size} height={size}>
      <Circle
        x={size / 2}
        y={size / 2}
        radius={size / 2}
        fill={style.color}
        stroke="#ffffff"
        strokeWidth={Math.max(1.5, size * 0.07)}
        shadowColor="black"
        shadowOpacity={0.25}
        shadowBlur={size * 0.25}
        shadowOffsetY={size * 0.06}
      />
      <KonvaText
        width={size}
        height={size}
        text={label}
        align="center"
        verticalAlign="middle"
        fontStyle="bold"
        fontFamily='system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        fontSize={size * (label.length > 2 ? 0.36 : label.length > 1 ? 0.44 : 0.52)}
        fill={contrastTextColor(style.color)}
        listening={false}
      />
    </Group>
  );
}
