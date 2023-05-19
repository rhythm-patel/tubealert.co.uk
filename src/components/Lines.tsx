import { onCleanup, onMount, useContext } from "solid-js";
import { Line } from "../services/Line";
import { ALL_LINES } from "../services/Line";
import Alert from "./Icons/Alert";
import ChevronRight from "./Icons/ChevronRight";
import { A } from "@solidjs/router";

export const Lines = () => {
  return (
    <menu class="overflow-y-auto lg:columns-2 gap-0 pb-[env(safe-area-inset-bottom)]">
      {ALL_LINES.map((line: Line) => (
        <li data-line={line.urlKey}>
          <A
            noScroll
            href={`/${line.urlKey}`}
            class="bg-line-background text-line-foreground p-1 flex justify-between gap-1 items-center hover:opacity-80"
          >
            <div class="flex-1">
              <h2>{line.name}</h2>
              <p>Good Service</p>
            </div>
            <div class="w-[42px] h-[42px]">
              <Alert />
            </div>
            <div class="w-[12px] h-[12px] opacity-50">
              <ChevronRight />
            </div>
          </A>
        </li>
      ))}
    </menu>
  );
};
