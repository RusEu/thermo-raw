import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface CheckboxProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
}

export function Checkbox({ checked, onCheckedChange, id, disabled }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'h-4 w-4 shrink-0 rounded border border-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary text-primary-foreground' : 'bg-background'
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
}

interface CheckboxWithLabelProps extends CheckboxProps {
  label: string
}

export function CheckboxWithLabel({ label, ...props }: CheckboxWithLabelProps) {
  const id = props.id || label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex items-center gap-2">
      <Checkbox {...props} id={id} />
      <label
        htmlFor={id}
        className="text-sm text-foreground cursor-pointer select-none"
      >
        {label}
      </label>
    </div>
  )
}
