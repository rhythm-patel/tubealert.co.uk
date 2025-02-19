import { Component, createSignal } from "solid-js";
import { Line } from "../services/Line";
import { createStoredSignal } from "../utils/createStoredSignal";
import {
  SUBSCRIPTION_DATA_LOCALSTORAGE_KEY,
  WeekSubscriptions,
} from "../services/Subscriptions";
import { base64UrlToUint8Array } from "../utils/base64UrlToUint8Array";
import { isSupported } from "../utils/pushManger";
import { Button } from "./Button";

const INPUT_FIELD_NAME = "subscriptions[]";

const getRow = (hour: number, subscriptions: WeekSubscriptions | null) => {
  const cols = [];
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const hourLabel = `${hour % 12 || 12}${hour >= 12 ? "pm" : "am"}`;

  for (let i = 1; i <= 7; i += 1) {
    const day = i === 7 ? 0 : i; // sunday is zero
    const inputID = `time-${day}-${hour}`;
    cols.push(
      <td class="relative py-[24px]">
        <label class="absolute inset-0 flex items-center justify-center">
          <input
            name={INPUT_FIELD_NAME}
            type="checkbox"
            value={`${i}-${hour}`}
            class=" w-[36px] h-[36px] accent-line-background"
            checked={subscriptions?.[i]?.[hour] === true}
          />
          <span class="sr-only">
            {days[day]} {hourLabel}
          </span>
        </label>
      </td>,
    );
  }

  return (
    <tr class="even:bg-body-background">
      <th class="text-lg">{hourLabel}</th>
      {cols}
    </tr>
  );
};

const getTable = (subscriptions: WeekSubscriptions | null) => {
  const rows = [];
  for (let i = 0; i <= 23; i += 1) {
    rows.push(getRow(i, subscriptions));
  }

  return (
    <table class="w-full">
      <thead class="bg-body-background sticky -top-1 z-10">
        <tr>
          <th class="w-[calc(100%/8)] py-0.5" />
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Monday">
              M
            </abbr>
          </th>
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Tuesday">
              T
            </abbr>
          </th>
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Wednesday">
              W
            </abbr>
          </th>
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Thursday">
              T
            </abbr>
          </th>
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Friday">
              F
            </abbr>
          </th>
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Saturday">
              S
            </abbr>
          </th>
          <th class="w-[calc(100%/8)] py-0.5">
            <abbr class="text-lg no-underline" title="Sunday">
              S
            </abbr>
          </th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
};

export type Subscriptions = {
  [key: string]: WeekSubscriptions;
};

const STATUS_TEXT = "Set which hours you wish to be notified for this line";

export const Subscription: Component<{ line: Line }> = (props) => {
  const [status, setStatus] = createSignal<string>(STATUS_TEXT);
  const [subscriptions, setSubscriptions] = createStoredSignal<Subscriptions>(
    SUBSCRIPTION_DATA_LOCALSTORAGE_KEY,
    {},
  );

  if (!isSupported) {
    return (
      <p>
        <strong>
          Your browser does not currenly support push notifications for disruption alerts. 
          If on iOS, please add this webpage to your homescreen and try again from there.
        </strong>
      </p>
    );
  }

  const saveSubscriptions = (evt: SubmitEvent, lineKey: string) => {
    evt.preventDefault();
    setStatus("Saving…");
    const data = new FormData(evt.target as any);
    const newSubscriptions: Subscriptions = { ...subscriptions() };
    const timeSlots: WeekSubscriptions = [];

    data.forEach((value, name) => {
      if (name !== INPUT_FIELD_NAME) {
        return;
      }
      const [day, hour] = value
        .toString()
        .split("-")
        .map((i) => parseInt(i));
      if (!timeSlots[day]) {
        timeSlots[day] = [];
      }
      timeSlots[day][hour] = true;
    });

    newSubscriptions[lineKey] = timeSlots;

    const swOptions = {
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(
        "BKSO9McPgFJ6DcngM1wB2hxI_rnLoPs_JhyRh8bFJw6BBX-QFxGKYnTSVtyLu4G3Vc3jihaDUIZWiaYqEtvs_dg",
      ),
    };

    window.navigator.serviceWorker.ready
      .then((serviceWorkerRegistration) =>
        serviceWorkerRegistration.pushManager.subscribe(swOptions),
      )
      .then((subscription) => {
        const postData = {
          userID: subscription.endpoint,
          lineID: lineKey,
          timeSlots,
          subscription,
        };
        return fetch("/api/subscribe", {
          method: "post",
          body: JSON.stringify(postData),
        });
      })
      .then(() => {
        setSubscriptions(newSubscriptions);
        setStatus("Saved ✅");
        window.setTimeout(() => {
          setStatus(STATUS_TEXT);
        }, 3000);
      })
      .catch((e) => {
        window.alert(
          "An error occurred. Please try deleting all subscriptions on the settings page and try again. " +
            "Note that for notifications to work on iOS, this app must be saved to your homescreen.",
        );
        console.error(e);
      });
  };

  return (
    <details>
      <summary class="border-y cursor-pointer text-lg py-1 mb-1">
        Alert me of disruptions (0)
      </summary>
      <form
        class="pb-[120px]"
        onSubmit={(evt) => saveSubscriptions(evt, props.line.tflKey)}
      >
        <fieldset>
          <legend
            class="z-20 flex gap-2 justify-between items-center fixed 
           bottom-1 left-1 right-1 bg-body-background rounded-lg p-0.5 pl-1 border
           border-solid border-current
           mb-[env(safe-area-inset-bottom)]"
          >
            {status()}
            <Button type="submit">Save</Button>
          </legend>
          {getTable(subscriptions()?.[props.line?.tflKey] || null)}
        </fieldset>
      </form>
    </details>
  );
};
