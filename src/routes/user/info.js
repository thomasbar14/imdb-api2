import DomParser from "dom-parser";
import apiRequestRawHtml from "../../helpers/apiRequestRawHtml";

export default async function userInfo(c) {
  let errorStatus = 500;

  try {
    const userId = c.req.param("id");
    const rawHtml = await apiRequestRawHtml(
      `https://www.imdb.com/user/${userId}`
    );

    const parser = new DomParser();
    const dom = parser.parseFromString(rawHtml);

    let data = {};

    try {
      const name = rawHtml.match(/<h1>(.*)<\/h1>/)[1];
      data.name = name || null;
    } catch (__) {
      data.name = null;
    }

    try {
      const created = rawHtml.match(
        /<div class="timestamp">IMDb member since (.*)<\/div>/
      )[1];
      data.member_since = created || null;
    } catch (__) {
      data.created = null;
    }

    try {
      let image = dom.getElementById("avatar");
      const imageSrc = image.getAttribute("src");

      if (imageSrc) {
        data.image = imageSrc.replace("._V1_SY100_SX100_", "");
      } else {
        data.image = null;
      }
    } catch (__) {
      data.image = null;
    }

    try {
      let badges = dom.getElementsByClassName("badges")[0];
      let mappedBadges = badges.childNodes
        .map((node) => {
          try {
            return {
              name: node.getElementsByClassName("name")[0].textContent,
              value: node.getElementsByClassName("value")[0].textContent,
            };
          } catch (__) {}
        })
        .filter(Boolean);

      data.badges = mappedBadges;
    } catch (_) {
      data.badges = [];
    }

    const result = Object.assign(
      {
        id: userId,
        imdb: `https://www.imdb.com/user/${userId}`,
        ratings_api_path: `/user/${userId}/ratings`,
      },
      data
    );

    return c.json(result);
  } catch (error) {
    c.status(errorStatus);
    return c.json({
      message: error.message,
    });
  }
}
