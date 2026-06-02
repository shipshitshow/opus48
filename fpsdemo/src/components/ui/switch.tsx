import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'pointer-events-auto cursor-pointer peer inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full border border-white/20 transition-colors',
      'data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=unchecked]:bg-white/10',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-[16px] w-[16px] translate-x-[3px] rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[21px] data-[state=checked]:bg-[#04121a]" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
