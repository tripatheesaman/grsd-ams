(function () {
    if (window.GridMvc) {
        GridMvc.prototype.openFilterPopup = function (self, html) {
            var columnType = $(this).attr("data-type") || "";
            var widget = self.getFilterWidgetForType(columnType);
            if (widget == null)
                return false;

            var columnName = $(this).attr("data-name") || "";
            var filterData = $(this).attr("data-filterdata") || "";
            var widgetData = $(this).attr("data-widgetdata") || "{}";
            var filterDataObj = self.parseFilterValues(filterData) || {};
            var filterUrl = $(this).attr("data-url") || "";

            $(".grid-dropdown").remove();
            $("body").append(html);

            var widgetContainer = $("body").children(".grid-dropdown").find(".grid-popup-widget");
            if (typeof (widget.onRender) != 'undefined')
                widget.onRender(widgetContainer, self.lang, columnType, filterDataObj, function (values) {
                    self.closeOpenedPopups();
                    self.applyFilterValues(filterUrl, columnName, values, false);
                }, $.parseJSON(widgetData));

            if ($(this).find(".grid-filter-btn").hasClass("filtered") && widget.showClearFilterButton()) {
                var inner = $("body").find(".grid-popup-additional");
                inner.append(self.getClearFilterButton(filterUrl));
                inner.find(".grid-filter-clear").click(function () {
                    self.applyFilterValues(filterUrl, columnName, "", true);
                });
            }
            var openResult = self.openMenuOnClick.call(this, self);
            if (typeof (widget.onShow) != 'undefined')
                widget.onShow();

            self.setupPopupInitialPosition($(this));
            return openResult;
        };

        GridMvc.prototype.setupPopupInitialPosition = function (popup) {
            var dropdown = $(".grid-dropdown");
            var arrow = dropdown.find(".grid-dropdown-arrow");

            var dropdownWidth = dropdown.width();
            var popupLeft = popup.offset().left;
            var popupTop = popup.offset().top;
            var winWidth = $(window).width();
            var dropdownTop = popupTop + 20;
            var dropdownLeft = 0;
            var arrowLeft = 0;

            if (popupLeft + dropdownWidth + 10 > winWidth) {
                dropdownLeft = winWidth - dropdownWidth - 10;
                arrowLeft = popupLeft - dropdownLeft - 3;
            } else {
                dropdownLeft = popupLeft - 20;
                arrowLeft = 17;
            }

            dropdown.attr("style", "display: block; left: " + dropdownLeft + "px; top: " + dropdownTop + "px !important");
            arrow.css("left", arrowLeft + "px");
        };

        GridMvc.prototype.openMenuOnClick = function (self) {
            if ($(this).hasClass("clicked")) return true;
            self.closeOpenedPopups();
            $(this).addClass("clicked");
            var popup = $("body").find(".grid-dropdown");
            if (popup.length == 0) return true;
            popup.show();
            popup.addClass("opened");
            self.openedMenuBtn = $(this);
            $(document).bind("click.gridmvc", function (e) {
                self.documentCallback(e, self);
            });
            return false;
        };
    }
}());