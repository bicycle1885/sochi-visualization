$(function() {

$(".control .toggle-btn-grp").on("click", ".toggle-btn", function() {
    var $this = $(this);

    if ($this.is(".toggle-btn-active")) {
        return;
    }

    $this.closest(".toggle-btn-grp")
        .find(".toggle-btn-active")
        .removeClass("toggle-btn-active");
    $this.addClass("toggle-btn-active");
});
});
