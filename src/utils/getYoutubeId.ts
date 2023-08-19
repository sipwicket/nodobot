export const getYoutubeId = (url: string) => {
  const youtubeId: string | undefined =
    /(youtu.*be.*)\/(watch\?v=|embed\/|v|shorts|)(.*?((?=[&#?])|$))/g.exec(
      url
    )?.[3];

  return youtubeId;
};
