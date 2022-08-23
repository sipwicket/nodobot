import pixelmatch from 'pixelmatch';

const comparisonSettings = {
  threshold: 0.5,
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
  const result = pixelmatch(img1, img2, null, 30, 30, { threshold });

  return result;
};
