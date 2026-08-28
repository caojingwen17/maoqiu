Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    icon: { type: String, value: '' },
    iconColor: { type: String, value: '#3E362C' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    value: { type: String, value: '' },
    valueBold: { type: Boolean, value: false },
    arrow: { type: Boolean, value: true },
    hairline: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap');
    }
  }
});