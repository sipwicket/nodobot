import pixelmatch from 'pixelmatch';
import { getImageDimensions } from './resizeImage';

const comparisonSettings = {
  threshold: 0.5,
  similarNumPixels: 100,
};
export const getComparisonSetting = (key: keyof typeof comparisonSettings) =>
  comparisonSettings[key];

export const setComparisonSetting = (
  key: keyof typeof comparisonSettings,
  value: typeof comparisonSettings[typeof key]
) => {
  comparisonSettings[key] = value;
  return comparisonSettings[key];
};

export const compareImages = (img1: Buffer, img2: Buffer) => {
  const threshold = getComparisonSetting('threshold');
  const { x, y } = getImageDimensions();

  const result = pixelmatch(img1, img2, null, x, y, { threshold });

  return result;
};
