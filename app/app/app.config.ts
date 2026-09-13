export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'stone'
    },
    formField: {
      slots: {
        label: 'block w-full text-right font-medium text-default',
        labelWrapper: 'flex content-center items-center justify-between gap-1 w-full',
        description: 'text-muted text-right',
        help: 'mt-2 text-muted text-right',
        error: 'mt-2 text-error text-right'
      }
    },
    select: {
      slots: {
        base: 'w-full justify-start text-right',
        value: 'flex-1 truncate text-right',
        placeholder: 'flex-1 truncate text-right text-dimmed',
        label: 'w-full text-right font-semibold text-highlighted',
        item: 'w-full justify-end text-right',
        itemWrapper: 'flex-1 flex flex-col min-w-0 items-end text-right',
        itemLabel: 'w-full truncate text-right',
        itemDescription: 'w-full truncate text-muted text-right'
      }
    },
    input: {
      slots: {
        base: 'text-right'
      }
    },
    tabs: {
      slots: {
        list: 'relative flex w-full p-1 group',
        trigger: 'group relative inline-flex items-center justify-center min-w-0 grow'
      }
    }
  }
})
