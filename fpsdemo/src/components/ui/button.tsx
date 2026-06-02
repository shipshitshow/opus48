import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'pointer-events-auto cursor-pointer inline-flex items-center font-bold tracking-[0.04em] transition-[transform,border-color,background,box-shadow] active:translate-y-px disabled:cursor-default',
  {
    variants: {
      variant: {
        // Primary cyan gradient
        default:
          'justify-center text-[18px] text-[#04121a] bg-gradient-to-r from-accent to-[#62e6ff] rounded-[10px] px-[34px] py-[13px] shadow-[0_6px_22px_rgba(0,216,255,0.35)] hover:-translate-y-px hover:shadow-[0_8px_26px_rgba(0,216,255,0.5)]',
        ghost:
          'justify-center text-[18px] bg-white/10 text-fg border border-white/20 rounded-[10px] px-[34px] py-[13px] hover:-translate-y-px',
        danger:
          'justify-center text-[18px] text-[#1a0608] bg-gradient-to-r from-[#ff4d6d] to-[#ff8a3c] rounded-[10px] px-[34px] py-[13px] shadow-[0_6px_22px_rgba(255,77,109,0.35)] hover:-translate-y-px',
        // Big left-aligned menu row
        stack:
          'gap-4 w-full text-left text-[16px] text-fg bg-white/5 border border-white/[0.16] rounded-xl px-5 py-4 hover:-translate-y-px hover:bg-white/10 hover:border-accent',
        // Subtle centered "back" row
        back:
          'w-full justify-center text-[15px] text-[#cbd3df] bg-white/[0.06] border border-white/[0.16] rounded-xl p-3 hover:border-white/30',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
