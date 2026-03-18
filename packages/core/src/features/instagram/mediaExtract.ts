export type InstagramApiResult = {
  type: "query_hash" | "query_id";
  data: any;
};

export type InstagramMediaItem = {
  url: string;
  type: "video" | "image";
  index: number;
};

function filterResourceData(data: any): any {
  let resource = data?.shortcode_media ?? data;
  if (resource?.owner == null && resource?.user != null) {
    resource.owner = resource.user;
  }
  if (resource?.owner == null) throw new Error("instagram: undefined owner");
  return resource;
}

export function extractInstagramMediaUrls(result: InstagramApiResult): InstagramMediaItem[] {
  const mediaItems: InstagramMediaItem[] = [];
  let index = 1;

  if (result.type === "query_hash") {
    const resource = filterResourceData(result.data);

    if (resource.__typename === "GraphVideo" && resource.video_url) {
      mediaItems.push({ url: resource.video_url, type: "video", index: index++ });
    } else if (resource.__typename === "GraphImage") {
      const res = resource.display_resources;
      if (Array.isArray(res) && res.length > 0) {
        const highest = res[res.length - 1];
        mediaItems.push({ url: highest.src, type: "image", index: index++ });
      }
    } else if (resource.__typename === "GraphSidecar" && resource.edge_sidecar_to_children) {
      for (const edge of resource.edge_sidecar_to_children.edges ?? []) {
        const node = edge.node;
        if (node.__typename === "GraphVideo" && node.video_url) {
          mediaItems.push({ url: node.video_url, type: "video", index: index++ });
        } else if (node.__typename === "GraphImage") {
          const res = node.display_resources;
          if (Array.isArray(res) && res.length > 0) {
            const highest = res[res.length - 1];
            mediaItems.push({ url: highest.src, type: "image", index: index++ });
          }
        }
      }
    }
  } else {
    const resource = filterResourceData(result.data);

    if (resource.carousel_media) {
      resource.carousel_media.forEach((mda: any, ind: number) => {
        const idx = ind + 1;
        if (mda.video_versions == null) {
          const candidates = mda.image_versions2?.candidates;
          if (Array.isArray(candidates) && candidates.length > 0) {
            const sorted = [...candidates].sort((a: any, b: any) => {
              const aSTP = new URL(a.url).searchParams.get("stp");
              const bSTP = new URL(b.url).searchParams.get("stp");
              if (aSTP && bSTP) return aSTP.length > bSTP.length ? 1 : aSTP.length < bSTP.length ? -1 : 0;
              return a.width < b.width ? 1 : a.width > b.width ? -1 : 0;
            });
            mediaItems.push({ url: sorted[0].url, type: "image", index: idx });
          }
        } else {
          const versions = mda.video_versions;
          if (Array.isArray(versions) && versions.length > 0) {
            mediaItems.push({ url: versions[0].url, type: "video", index: idx });
          }
        }
      });
    } else {
      if (resource.video_versions == null) {
        const candidates = resource.image_versions2?.candidates;
        if (Array.isArray(candidates) && candidates.length > 0) {
          const sorted = [...candidates].sort((a: any, b: any) => {
            const aSTP = new URL(a.url).searchParams.get("stp");
            const bSTP = new URL(b.url).searchParams.get("stp");
            if (aSTP && bSTP) return aSTP.length > bSTP.length ? 1 : aSTP.length < bSTP.length ? -1 : 0;
            return a.width < b.width ? 1 : a.width > b.width ? -1 : 0;
          });
          mediaItems.push({ url: sorted[0].url, type: "image", index: index++ });
        }
      } else {
        const versions = resource.video_versions;
        if (Array.isArray(versions) && versions.length > 0) {
          mediaItems.push({ url: versions[0].url, type: "video", index: index++ });
        }
      }
    }
  }

  return mediaItems;
}

