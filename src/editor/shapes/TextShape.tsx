import { Label, Tag, Text as KonvaText } from 'react-konva';
import { hasTextBackground, readTextData } from '@/src/annotations/text/textStyle';
import type { CommonShapeProps } from '@/src/editor/shapes/types';
import type { EditorObject } from '@/src/shared/types';

interface TextShapeProps extends CommonShapeProps {
  object: EditorObject;
  /** Hidden while the inline textarea overlay is editing this same object. */
  hidden?: boolean;
}

/** Text auto-sizes to its content, so the object's stored width/height are ignored here. */
export function TextShape({ object, hidden, width: _width, height: _height, ...common }: TextShapeProps) {
  const data = readTextData(object.style);
  const withBackground = hasTextBackground(data);
  return (
    <Label {...common} visible={!hidden}>
      <Tag
        fill={withBackground ? data.backgroundColor : 'transparent'}
        cornerRadius={data.cornerRadius}
        shadowColor="black"
        shadowOpacity={withBackground ? 0.18 : 0}
        shadowBlur={data.fontSize * 0.4}
        shadowOffsetY={data.fontSize * 0.1}
      />
      <KonvaText
        text={data.text}
        fontFamily={data.fontFamily}
        fontSize={data.fontSize}
        fontStyle={data.fontWeight >= 600 ? 'bold' : 'normal'}
        fill={data.color}
        padding={data.padding}
        align={data.align}
        lineHeight={1.25}
      />
    </Label>
  );
}
