import {
  animationsEnabledSignal,
  enableAnimations,
  disableAnimations,
} from "../../core/toolbar_animation.js"

export const renderToolbarAnimationSetting = () => {
  const animCheckbox = document.querySelector("#toggle_anims")
  animCheckbox.checked = animationsEnabledSignal.value
  animCheckbox.onchange = () => {
    if (animCheckbox.checked) {
      enableAnimations()
    } else {
      disableAnimations()
    }
  }
  // enable toolbar transition only after first render
  setTimeout(() => {
    document.querySelector("#toolbar").setAttribute("data-animate", "")
  })
}
