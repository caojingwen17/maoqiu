let timer = null;

Component({
  options: { styleIsolation: 'apply-shared' },
  data: {
    visible: false,
    message: '',
    icon: 'check'
  },
  methods: {
    show(message, icon = 'check') {
      if (timer) clearTimeout(timer);
      this.setData({ visible: true, message, icon });
      timer = setTimeout(() => {
        this.setData({ visible: false });
      }, 1800);
    },
    hide() {
      if (timer) clearTimeout(timer);
      this.setData({ visible: false });
    }
  }
});