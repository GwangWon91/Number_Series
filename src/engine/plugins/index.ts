import type { TypePlugin } from '../plugin';
import arithmetic from './arithmetic';
import diffArithmetic from './diff-arithmetic';
import diffCycle from './diff-cycle';
import diffGeometric from './diff-geometric';
import diffSecond from './diff-second';
import fibonacciLike from './fibonacci-like';
import fraction from './fraction';
import geometric from './geometric';
import grouped from './grouped';
import interleaved from './interleaved';
import linearRecurrence from './linear-recurrence';
import powerOffset from './power-offset';
import rational from './rational';

/** 유형 생성기 등록부. 새 유형은 여기에 한 줄 추가하고 config/types/<id>.yaml을 만든다. */
export const PLUGINS: readonly TypePlugin[] = [
  arithmetic,
  geometric,
  diffArithmetic,
  diffGeometric,
  diffSecond,
  diffCycle,
  linearRecurrence,
  interleaved,
  fibonacciLike,
  grouped,
  fraction,
  powerOffset,
  rational,
];
