import { HeartIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { useDonateReminder } from '../../hooks/useDonateReminder'

export function DonateReminder() {
  const { visible, dismiss } = useDonateReminder()

  if (!visible) return null

  return (
    <Dialog open={visible} onClose={dismiss} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="relative w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <button
            data-autofocus
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute right-3 top-3 rounded-sm p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <XMarkIcon className="size-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
              <HeartIcon className="size-5 text-violet-600 dark:text-violet-400" />
            </div>

            <DialogTitle className="text-base font-semibold">Love SkyTrace?</DialogTitle>

            <p className="mt-1.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              It&apos;s free and open source, but maintaining it takes time and servers cost money.
            </p>

            <a
              href="https://ko-fi.com/alyraffauf"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 dark:bg-violet-400 dark:text-zinc-950 dark:hover:bg-violet-300"
            >
              <HeartIcon className="size-4" />
              Support on Ko-fi
            </a>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
