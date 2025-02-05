import { config } from "dotenv";
config();

import _bolt from "@slack/bolt";
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const { App } = _bolt;

const rootUrl = process.env.ROOT_URL || "https://misguided.enterprises/hkgi";

const itemEmojis = {
  bbc_seed: "bractus_seed",
  bbc_essence: "bread_essence",
  bbc_compressence: "bressence",
  bbc_item: "rolling_pin",

  hvv_seed: "hacker_vibes_vine_seed",
  hvv_essence: "hacker_spirit",
  hvv_compressence: "hacksprit",
  hvv_item: "vine_keyboard",

  cyl_seed: "coffea_cyl_seed",
  cyl_essence: "cyl_crystal",
  cyl_compressence: "crystcyl",
  cyl_item: "cyl_wand",

  nest_egg: "nest_egg",
  bbc_egg: "bread_egg",
  hvv_egg: "hacker_egg",
  cyl_egg: "cyl_egg",

  powder_t1: "warp_powder",
  powder_t2: "rift_powder",
  powder_t3: "wormhole_powder",

  land_deed: "land_deed",

  cyl_bag_t1: "crystalline_buzzwing_bagling",
  hvv_bag_t1: "spirited_buzzwing_bagling",
  bbc_bag_t1: "doughy_buzzwing_bagling",

  cyl_bag_t2: "crystalline_buzzwing_boxlet",
  hvv_bag_t2: "spirited_buzzwing_boxlet",
  bbc_bag_t2: "doughy_buzzwing_boxlet",

  cyl_bag_t3: "crystalline_buzzwing_megabox",
  hvv_bag_t3: "spirited_buzzwing_megabox",
  bbc_bag_t3: "doughy_buzzwing_megabox",

  bag_egg_t1: "bagling_egg",
  bag_egg_t2: "boxlet_egg",
  bag_egg_t3: "megabox_egg",
};

const plantImages = {
  dirt: "https://github.com/hackagotchi/hackagotchi/blob/master/img/icon/dirt.png?raw=true",
  bbc: "https://github.com/hackagotchi/hackagotchi/blob/master/img/plant/bractus_loaf.gif?raw=true",
  hvv: "https://github.com/hackagotchi/hackagotchi/blob/master/img/plant/hacker_vibes_vine_baby.gif?raw=true",
  cyl: "https://github.com/hackagotchi/hackagotchi/blob/master/img/plant/coffea_cyl_baby.gif?raw=true",
};

function inventoryToItemList(inventory) {
  const items = [];

  for (const item in inventory) {
    if (Object.hasOwnProperty.call(inventory, item)) {
      const count = inventory[item];

      for (let i = 0; i < count; i++) {
        items.push(item);
      }
    }
  }

  return items;
}

function canCraft(inventory, recipe) {
  for (const [item, countNeeded] of Object.entries(recipe.needs)) {
    if ((inventory[item] || 0) < countNeeded) {
      return false;
    }
  }

  return true;
}

let manifest;
let userActivity = {};

const prisma = new PrismaClient();
const app = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  customRoutes: [
    {
      method: "GET",
      path: "/user",
      async handler(req, res) {
        const url = new URL(req.url, "https://misguided.enterprises/hksl");

        const username = url.searchParams.get("username");
        const slackId = url.searchParams.get("slack_id");

        res.setHeader("Content-Type", "application/json");

        if (!username && !slackId) {
          return res.end(
            JSON.stringify({
              ok: false,
              msg: "must provide ?username= or ?slack_id=",
            })
          );
        }

        const user = username
          ? await prisma.user.findFirst({
              where: { username },
              select: { username: true, slackId: true },
            })
          : await prisma.user.findUnique({
              where: { slackId },
              select: { username: true, slackId: true },
            });

        if (!user) {
          return res.end(JSON.stringify({ ok: false, msg: "user not found" }));
        }

        res.end(JSON.stringify({ ok: true, user: user }));
      },
    },
    {
      method: "POST",
      path: "/webhook",
      handler(req, res) {
        let rawBody = "";
        req.on("data", (chunk) => (rawBody += chunk));
        req.on("end", async () => {
          const body = JSON.parse(rawBody);

          if (body.kind == "gib") {
            // is the receiving user on Slack?

            const user = await prisma.user.findFirst({
              where: { username: body.to },
            });

            if (!user) return;

            const sendingUser = await prisma.user.findFirst({
              where: { username: body.from },
            });

            await app.client.chat.postMessage({
              channel: user.slackId,
              text: `You received ${body.amount} :${itemEmojis[body.item]}: *${
                manifest.items[body.item].name
              }* from ${
                sendingUser ? `<@${sendingUser.slackId}>` : body.from
              }!`,
            });
          }
        });

        res.end();
      },
    },
  ],
});

setInterval(() => {
  const activeUsers = Object.entries(userActivity)
    .filter(([, lastActive]) => lastActive < Date.now() + 1000 * 60 * 5)
    .map(([user]) => user);

  activeUsers.forEach(async (user) => {
    if (await prisma.user.findUnique({ where: { slackId: user } })) {
      try {
        await updateAppHome(user);
      } catch (e) {
        console.log(e);
        console.log("e");
      }
    }
  });
}, 5000);

async function updateAppHome(userId) {
  const user = await prisma.user.findUnique({ where: { slackId: userId } });

  if (!user) {
    return await app.client.views.publish({
      user_id: userId,
      view: {
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Welcome to hksl, the Slack client for hkgi.",
            },
          },

          {
            type: "actions",
            elements: [
              {
                type: "button",
                action_id: "auth",
                text: {
                  type: "plain_text",
                  text: "Sign in or sign up",
                },
              },
            ],
          },
        ],
      },
    });
  }

  const { data: stead } = await axios(`${rootUrl}/getstead`, {
    auth: { username: user.username, password: user.password },
  });

  await app.client.views.publish({
    user_id: userId,
    view: {
      type: "home",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Your stead",
          },
        },
        ...stead.plants.flatMap((plant, plotIndex) => {
          const ttYield = Math.ceil(plant.tt_yield / 1000);

          return [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${manifest.plant_titles[plant.kind]}* \`${
                  plant.kind
                }\` lvl. ${plant.lvl} ${
                  plant.kind == "dirt" ? "\n\n_So much opportunity!_" : ""
                } ${(plant.statuses || [])
                  .map((status) => `:${itemEmojis[status.kind]}:`)
                  .join(" ")}`,
              },
              fields: plant.tt_yield
                ? [
                    {
                      type: "mrkdwn",
                      // text: `*:clock${
                      //   (ttYield % 13) + Math.floor(ttYield / 13)
                      // }: Next yield*\n${ttYield} seconds`,
                      text: `*:clock2: Next yield*\n${ttYield} seconds`,
                    },
                  ]
                : undefined,
              accessory: plantImages[plant.kind]
                ? {
                    type: "image",
                    image_url: plantImages[plant.kind],
                    alt_text: manifest.plant_titles[plant.kind],
                  }
                : undefined,
            },
            ...(manifest.plant_recipes[plant.kind] || [])
              .filter((recipe) => plant.lvl >= recipe.lvl)
              .flatMap((recipe, recipeIndex) => {
                const canCraftItem = canCraft(stead.inv, recipe);

                // Hide plant recipes if they're uncraftable
                if (
                  !canCraftItem &&
                  recipe.change_plant_to &&
                  recipe.change_plant_to != "dirt"
                ) {
                  return [];
                }

                const formatMakeItem = (make_item) => {
                  if (typeof make_item == "string")
                    return (
                      `:${itemEmojis[recipe.make_item]}: ` +
                      manifest.items[recipe.make_item].name
                    );
                  else
                    return make_item.one_of
                      .map(([_chance, slug]) => `:${itemEmojis[slug]}:`)
                      .join("/");
                };

                return [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text:
                        Object.entries(recipe.needs)
                          .map(
                            ([item, count]) =>
                              `${count} :${itemEmojis[item]}: ${manifest.items[item].name}`
                          )
                          .join(", ") +
                        " :arrow_right: *" +
                        (recipe.make_item
                          ? formatMakeItem(recipe.make_item)
                          : ":seedling: " +
                            manifest.plant_titles[recipe.change_plant_to]) +
                        "*",
                    },
                    accessory: {
                      type: "button",
                      text: {
                        type: "plain_text",
                        emoji: true,
                        text:
                          recipe.change_plant_to &&
                          recipe.change_plant_to != "dirt"
                            ? ":seedling: Plant"
                            : canCraftItem
                            ? ":hammer_and_pick: Craft"
                            : "Can't craft this",
                      },
                      action_id: "craft",
                      value: JSON.stringify({ plotIndex, recipeIndex }),
                      style:
                        (recipe.change_plant_to &&
                          recipe.change_plant_to != "dirt") ||
                        (!stead.plants.some((plant) => plant.kind == "dirt") &&
                          canCraftItem)
                          ? "primary"
                          : undefined,
                      // confirm: recipe.change_plant_to
                      //   ? {
                      //       title: {
                      //         type: "plain_text",
                      //         text: "Are you sure?",
                      //       },
                      //       text: {
                      //         type: "mrkdwn",
                      //         text: `This will replace the plant in this plot with a new one. Are you sure you want to do this?`,
                      //       },
                      //       confirm: {
                      //         type: "plain_text",
                      //         text: "Yes",
                      //       },
                      //       deny: {
                      //         type: "plain_text",
                      //         text: "No",
                      //       },
                      //     }
                      //   : undefined,
                    },
                  },
                ];
              }),
            { type: "divider" },
          ];
        }),
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Inventory",
          },
        },
        ...Object.entries(stead.inv)
          .filter(([, count]) => count > 0)
          .map(([item, count]) => ({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:${itemEmojis[item]}: ${
                manifest.items[item].name
              } \`${item}\`${count > 1 ? ` *x${count}*` : ""}`,
            },
            accessory: manifest.items[item].usable
              ? {
                  type: "overflow",
                  action_id: `item_options:${item}`,
                  options: [
                    {
                      text: {
                        type: "plain_text",
                        emoji: true,
                        text: item.includes("egg")
                          ? ":nest_egg: Hatch"
                          : `:${itemEmojis[item]}: Use item`,
                      },
                      value: "use",
                    },
                    {
                      text: {
                        type: "plain_text",
                        emoji: true,
                        text: ":package: Send",
                      },
                      value: "send",
                    },
                  ],
                }
              : {
                  type: "button",
                  action_id: "send",
                  value: item,
                  text: {
                    type: "plain_text",
                    emoji: true,
                    text: ":package: Send",
                  },
                },
          })),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `hksl v0.1 · Signed in as \`${user.username}\``,
            },
          ],
        },
      ],
    },
  });
}

app.event("app_home_opened", async ({ event }) => {
  userActivity[event.user] = Date.now();
  await updateAppHome(event.user);
});

app.action("auth", async ({ ack, client, body }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: "modal",
      title: {
        type: "plain_text",
        text: "Sign in or sign up",
      },
      callback_id: "auth",
      submit: {
        type: "plain_text",
        text: "Go!",
      },
      blocks: [
        {
          type: "input",
          block_id: "username",
          label: {
            type: "plain_text",
            text: "Username",
          },
          element: {
            type: "plain_text_input",
            action_id: "username",
            placeholder: {
              type: "plain_text",
              text: "cjdenio",
            },
          },
        },
        {
          type: "input",
          block_id: "password",
          label: {
            type: "plain_text",
            text: "Password",
          },
          element: {
            type: "plain_text_input",
            action_id: "password",
            placeholder: {
              type: "plain_text",
              text: "hunter2",
            },
          },
          hint: {
            type: "plain_text",
            text: "If you don't have an account, it'll be created with this password.",
          },
        },
      ],
    },
  });
});

app.view("auth", async ({ ack, view, body }) => {
  const username = view.state.values.username.username.value;
  const password = view.state.values.password.password.value;

  const { data } = await axios.post(
    `${rootUrl}/testauth`,
    {},
    {
      auth: {
        username,
        password,
      },
    }
  );

  if (!data.ok) {
    if (data.msg == "user doesn't exist") {
      // create user
      await axios.post(`${rootUrl}/signup`, {
        user: username,
        pass: password,
      });

      await ack();
      await prisma.user.create({
        data: { slackId: body.user.id, username, password },
      });

      await updateAppHome(body.user.id);
    } else if (data.msg == "wrong password") {
      await ack({
        response_action: "errors",
        errors: {
          password: "incorrect password",
        },
      });
    } else {
      await ack({
        response_action: "errors",
        errors: {
          username: "something went wrong",
        },
      });
    }
  } else {
    await ack();
    await prisma.user.create({
      data: { slackId: body.user.id, username, password },
    });

    await updateAppHome(body.user.id);
  }
});

app.action("send", async ({ ack, action, body, client }) => {
  userActivity[body.user.id] = Date.now();
  await ack();

  const user = await prisma.user.findUniqueOrThrow({
    where: { slackId: body.user.id },
  });

  await client.views.open({
    trigger_id: body.trigger_id,
    view: sendModal(action.value, user),
  });
});

// app.action("send_with_username", async ({ ack, view, client }) => {
//   await ack();
//   await client.views.update({
//     view_id: view,
//   });
// });

app.view("send", async ({ view, ack, body }) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { slackId: body.user.id },
  });

  let recipientUsername;
  let recipient;
  let userField;

  if (view.state.values.user) {
    // send by slack user

    recipient = await prisma.user.findUnique({
      where: { slackId: view.state.values.user.user.selected_user },
    });

    if (!recipient) {
      return ack({
        response_action: "errors",
        errors: {
          user: "this user doesn't have a hkgi account",
        },
      });
    }

    recipientUsername = recipient.username;
    userField = "user";
  } else {
    // send by username

    recipientUsername = view.state.values.username.username.value;
    recipient = await prisma.user.findFirst({
      where: { username: recipientUsername },
    });
    recipientField = "username";
  }

  const { data } = await axios.post(
    `${rootUrl}/gib`,
    {
      person: recipientUsername,
      item: view.private_metadata,
      amount: parseInt(view.state.values.amount.amount.value),
    },
    {
      auth: {
        username: user.username,
        password: user.password,
      },
    }
  );

  if (!data.ok) {
    if (data.msg == "who dat?") {
      await ack({
        response_action: "errors",
        errors: {
          [userField]: "that user doesn't exist",
        },
      });
    } else if (data.msg == "you can't afford that!") {
      await ack({
        response_action: "errors",
        errors: {
          amount: "you don't have that much!",
        },
      });
    } else {
      await ack({
        response_action: "errors",
        errors: {
          [userField]: "something went wrong",
        },
      });
    }
  } else {
    await ack();

    await updateAppHome(body.user.id);

    if (recipient) {
      await updateAppHome(recipient.slackId);
    }
  }
});

function sendModal(item, user) {
  return {
    type: "modal",
    callback_id: "send",
    private_metadata: item,
    title: {
      type: "plain_text",
      text: "Send item",
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:${itemEmojis[item]}: Sending: *${manifest.items[item].name}* \`${item}\``,
        },
      },
      {
        type: "input",
        label: {
          type: "plain_text",
          text: "Amount to send",
        },
        block_id: "amount",
        element: {
          type: "number_input",
          is_decimal_allowed: false,
          initial_value: "1",
          action_id: "amount",
        },
      },
      {
        type: "input",
        label: {
          type: "plain_text",
          text: "Slack user to send to",
        },
        block_id: "user",
        element: {
          type: "users_select",
          action_id: "user",
        },
      },
      // {
      //   type: "section",
      //   text: {
      //     type: "mrkdwn",
      //     text: "Need to send to someone outside Slack?",
      //   },
      //   accessory: {
      //     type: "button",
      //     action_id: "send_with_username",
      //     text: {
      //       type: "plain_text",
      //       text: "Send with username",
      //     },
      //   },
      // },
    ],
    submit: {
      type: "plain_text",
      text: "Send",
    },
  };
}

app.action(/^item_options:.+/, async ({ ack, action, body, client }) => {
  userActivity[body.user.id] = Date.now();
  await ack();

  const user = await prisma.user.findUniqueOrThrow({
    where: { slackId: body.user.id },
  });

  const item = action.action_id.split(":")[1];

  const option = action.selected_option.value;

  if (option == "use") {
    await axios.post(
      `${rootUrl}/useitem`,
      {
        item,
      },
      {
        auth: { username: user.username, password: user.password },
      }
    );
  } else if (option == "send") {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: sendModal(item, user),
    });
  } else {
    console.log(`unknown option: ${option}`);
  }

  await updateAppHome(body.user.id);
});

app.action("craft", async ({ ack, action, body }) => {
  await ack();

  const user = await prisma.user.findUniqueOrThrow({
    where: { slackId: body.user.id },
  });

  userActivity[body.user.id] = Date.now();

  const value = JSON.parse(action.value);

  const { data } = await axios.post(
    `${rootUrl}/craft`,
    {
      plot_index: value.plotIndex,
      recipe_index: value.recipeIndex,
    },
    {
      auth: {
        username: user.username,
        password: user.password,
      },
    }
  );

  await updateAppHome(body.user.id);
});

(async () => {
  const { data: _manifest } = await axios(`${rootUrl}/manifest`);
  manifest = _manifest;

  await app.start(3015);
  console.log("hksl started");
})();
