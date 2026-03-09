import * as React from 'react'
import { cn } from '../../lib/utils'

const ButtonGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center [&>*]:relative [&>*]:focus-visible:z-10 [&>*:not(:first-child)]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none',
          className,
        )}
        {...props}
      />
    )
  },
)
ButtonGroup.displayName = 'ButtonGroup'

export { ButtonGroup }
